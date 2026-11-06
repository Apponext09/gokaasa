import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';
import { pool } from '../../src/db/pool.js';

const PASSWORD = 'Strong-pass-123';
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

let app;
let adminToken, onboardingToken, salesToken, customerToken;
let onboardingUserId, salesUserId;
let hotelId;

async function loginAs(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return res.body.accessToken;
}

before(async () => {
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'oaa.admin@test.gokaasa.com', password: PASSWORD, roleCode: 'ADMIN' });
  onboardingUserId = await createUserWithRole({ email: 'oaa.onboarding@test.gokaasa.com', password: PASSWORD, roleCode: 'HOTEL_ONBOARDING_EXECUTIVE' });
  salesUserId = await createUserWithRole({ email: 'oaa.sales@test.gokaasa.com', password: PASSWORD, roleCode: 'SALES_EXECUTIVE' });
  await createUserWithRole({ email: 'oaa.customer@test.gokaasa.com', password: PASSWORD, roleCode: 'CUSTOMER' });

  adminToken = await loginAs('oaa.admin@test.gokaasa.com');
  onboardingToken = await loginAs('oaa.onboarding@test.gokaasa.com');
  salesToken = await loginAs('oaa.sales@test.gokaasa.com');
  customerToken = await loginAs('oaa.customer@test.gokaasa.com');

  const create = await request(app)
    .post('/api/admin/hotels')
    .set(bearer(onboardingToken))
    .send({ name: 'Analytics Test Hotel', city: 'Pune', countryCode: 'IN' });
  hotelId = create.body.hotel.id;

  // Edited by a different staff member than the creator, as ADMIN (who can edit any hotel).
  await request(app)
    .patch(`/api/admin/hotels/${hotelId}`)
    .set(bearer(adminToken))
    .send({ description: 'A test hotel used for onboarding analytics assertions.' });
});

after(closeTestDatabase);

describe('onboarding analytics & audit APIs -- authorization', () => {
  it('refuses an unauthenticated caller', async () => {
    assert.equal((await request(app).get('/api/admin/onboarding-analytics/overview')).status, 401);
  });

  for (const path of [
    '/api/admin/onboarding-analytics/overview',
    '/api/admin/onboarding-analytics/monthly-trends',
    '/api/admin/onboarding-analytics/employees',
    `/api/admin/onboarding-analytics/employees/${1}`,
    `/api/admin/hotels/${1}/activity-history`,
  ]) {
    it(`refuses a non-admin onboarding executive on ${path}`, async () => {
      const res = await request(app).get(path).set(bearer(onboardingToken));
      assert.equal(res.status, 403);
    });

    it(`refuses a customer on ${path}`, async () => {
      const res = await request(app).get(path).set(bearer(customerToken));
      assert.equal(res.status, 403);
    });
  }

  it('allows an admin', async () => {
    const res = await request(app).get('/api/admin/onboarding-analytics/overview').set(bearer(adminToken));
    assert.equal(res.status, 200);
  });
});

describe('hotel onboarding/edit attribution on GET /admin/hotels', () => {
  it('reports the actual creator as onboardedBy and the actual editor as lastEditedBy', async () => {
    const res = await request(app).get(`/api/admin/hotels/${hotelId}`).set(bearer(adminToken));
    assert.equal(res.status, 200);
    assert.equal(res.body.hotel.onboardedBy.id, onboardingUserId);
    assert.equal(res.body.hotel.onboardedBy.email, 'oaa.onboarding@test.gokaasa.com');
    assert.notEqual(res.body.hotel.lastEditedBy.id, onboardingUserId);
  });

  it('a hotel with no attributable creator renders a null onboardedBy (never a guessed one)', async () => {
    await pool.query(`UPDATE hotels SET created_by = NULL WHERE id = $1`, [hotelId]);
    const res = await request(app).get(`/api/admin/hotels/${hotelId}`).set(bearer(adminToken));
    assert.equal(res.body.hotel.onboardedBy, null);
    await pool.query(`UPDATE hotels SET created_by = $1 WHERE id = $2`, [onboardingUserId, hotelId]);
  });
});

describe('GET /admin/hotels/:id/activity-history', () => {
  it('includes both the creation and the later edit as separate entries', async () => {
    const res = await request(app).get(`/api/admin/hotels/${hotelId}/activity-history`).set(bearer(adminToken));
    assert.equal(res.status, 200);
    const actions = res.body.items.map((item) => item.action);
    assert.ok(actions.includes('hotel.created'));
    assert.ok(actions.includes('hotel.updated'));
  });
});

describe('GET /admin/onboarding-analytics/employees', () => {
  it('lists the onboarding executive with 1 onboarded hotel and the admin with 1 edit', async () => {
    const res = await request(app).get('/api/admin/onboarding-analytics/employees').set(bearer(adminToken)).query({ limit: 100 });
    assert.equal(res.status, 200);
    const onboardingRow = res.body.items.find((row) => row.id === onboardingUserId);
    assert.ok(onboardingRow);
    assert.equal(onboardingRow.onboarded, 1);
  });

  it('does not list staff with zero hotel activity', async () => {
    const res = await request(app).get('/api/admin/onboarding-analytics/employees').set(bearer(adminToken)).query({ limit: 100 });
    assert.ok(!res.body.items.some((row) => row.id === salesUserId));
  });
});

describe('GET /admin/onboarding-analytics/employees/:id', () => {
  it('returns the onboarding executive\'s profile and stats', async () => {
    const res = await request(app).get(`/api/admin/onboarding-analytics/employees/${onboardingUserId}`).set(bearer(adminToken));
    assert.equal(res.status, 200);
    assert.equal(res.body.employee.onboarded, 1);
    assert.equal(res.body.employee.email, 'oaa.onboarding@test.gokaasa.com');
  });

  it('404s for an id with no user', async () => {
    const res = await request(app).get('/api/admin/onboarding-analytics/employees/999999').set(bearer(adminToken));
    assert.equal(res.status, 404);
  });
});

describe('GET /admin/onboarding-analytics/employees/:id/activities', () => {
  it('returns only this employee\'s hotel activity, paginated', async () => {
    const res = await request(app).get(`/api/admin/onboarding-analytics/employees/${onboardingUserId}/activities`).set(bearer(adminToken));
    assert.equal(res.status, 200);
    assert.ok(res.body.items.every((item) => item.action === 'hotel.created'));
    assert.ok('pagination' in res.body);
  });
});

describe('GET /admin/onboarding-analytics/monthly-trends', () => {
  it('returns 12 zero-filled months including the current one, with our hotel counted', async () => {
    const res = await request(app).get('/api/admin/onboarding-analytics/monthly-trends').set(bearer(adminToken));
    assert.equal(res.status, 200);
    assert.equal(res.body.trends.length, 12);
    const thisMonth = new Date().toISOString().slice(0, 7);
    const row = res.body.trends.find((t) => t.month === thisMonth);
    assert.ok(row && row.count >= 1);
  });
});

describe('GET /admin/exports/employee-performance', () => {
  it('returns a CSV with the onboarding executive\'s row', async () => {
    const res = await request(app).get('/api/admin/exports/employee-performance').set(bearer(adminToken));
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);
    assert.match(res.text, /oaa\.onboarding@test\.gokaasa\.com/);
  });
});
