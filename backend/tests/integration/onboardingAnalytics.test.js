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

describe('listing vs. detail consistency (date-filtered)', () => {
  let adminUserId;
  let hotelThisMonth, hotelLastMonth;
  const today = new Date();
  const thisMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const lastMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const lastMonthEnd = new Date(thisMonthStart.getTime() - 1);
  const isoDate = (d) => d.toISOString().slice(0, 10);

  before(async () => {
    adminUserId = (await pool.query(`SELECT id FROM users WHERE email = $1`, ['oaa.admin@test.gokaasa.com'])).rows[0].id;
    hotelThisMonth = hotelId;

    // A second hotel, created by the same onboarding executive, backdated into last month.
    const create = await request(app).post('/api/admin/hotels').set(bearer(onboardingToken)).send({ name: 'Analytics Test Hotel 2', city: 'Nashik', countryCode: 'IN' });
    hotelLastMonth = create.body.hotel.id;
    await pool.query(`UPDATE hotels SET created_at = $1 WHERE id = $2`, [lastMonthStart, hotelLastMonth]);

    // A second edit to the FIRST hotel (same hotel as the one edited in the top-level before()), by the
    // same admin, backdated into last month -- this is what tests "multiple edits to one hotel don't
    // inflate the unique-hotels-edited count" once both edits fall inside one wide range.
    await request(app).patch(`/api/admin/hotels/${hotelThisMonth}`).set(bearer(adminToken)).send({ description: 'Second edit, backdated for the date-range consistency test.' });
    await pool.query(
      `UPDATE audit_logs SET created_at = $1
        WHERE id = (SELECT id FROM audit_logs WHERE entity = 'hotel' AND entity_id = $2 AND action = 'hotel.updated' ORDER BY id DESC LIMIT 1)`,
      [lastMonthStart, hotelThisMonth],
    );
  });

  async function listingRowFor(userId, range) {
    const res = await request(app).get('/api/admin/onboarding-analytics/employees').set(bearer(adminToken)).query({ limit: 100, ...range });
    return res.body.items.find((row) => row.id === userId) ?? { onboarded: 0, approved: 0, pending: 0, changesRequested: 0, hotelsEdited: 0, totalModifications: 0 };
  }
  async function detailFor(userId, range) {
    const res = await request(app).get(`/api/admin/onboarding-analytics/employees/${userId}`).set(bearer(adminToken)).query(range);
    return res.body.employee;
  }

  it('onboarded counts match between listing and detail for "this month" only', async () => {
    const range = { from: isoDate(thisMonthStart), to: isoDate(today) };
    const listing = await listingRowFor(onboardingUserId, range);
    const detail = await detailFor(onboardingUserId, range);
    assert.equal(listing.onboarded, 1);
    assert.equal(listing.onboarded, detail.onboarded);
  });

  it('onboarded counts match between listing and detail for "last month" only', async () => {
    const range = { from: isoDate(lastMonthStart), to: isoDate(lastMonthEnd) };
    const listing = await listingRowFor(onboardingUserId, range);
    const detail = await detailFor(onboardingUserId, range);
    assert.equal(listing.onboarded, 1);
    assert.equal(listing.onboarded, detail.onboarded);
  });

  it('a wide range counts both hotels, identically on both pages', async () => {
    const range = { from: isoDate(lastMonthStart), to: isoDate(today) };
    const listing = await listingRowFor(onboardingUserId, range);
    const detail = await detailFor(onboardingUserId, range);
    assert.equal(listing.onboarded, 2);
    assert.equal(listing.onboarded, detail.onboarded);
  });

  it('two edits to the same hotel count as 1 unique hotel edited but 2 modification activities -- on both pages', async () => {
    const range = { from: isoDate(lastMonthStart), to: isoDate(today) };
    const listing = await listingRowFor(adminUserId, range);
    const detail = await detailFor(adminUserId, range);
    assert.equal(listing.hotelsEdited, 1);
    assert.equal(listing.totalModifications, 2);
    assert.equal(listing.hotelsEdited, detail.hotelsEdited);
    assert.equal(listing.totalModifications, detail.totalModifications);
  });

  it('editing activity outside the selected range is excluded from both pages equally', async () => {
    const range = { from: isoDate(thisMonthStart), to: isoDate(today) };
    const listing = await listingRowFor(adminUserId, range);
    const detail = await detailFor(adminUserId, range);
    assert.equal(listing.totalModifications, 1);
    assert.equal(listing.totalModifications, detail.totalModifications);
  });

  it('an employee with no activity in the selected range reports zero, not an error, on both pages', async () => {
    const twoMonthsAgoStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1));
    const range = { from: isoDate(twoMonthsAgoStart), to: isoDate(new Date(lastMonthStart.getTime() - 1)) };
    const listing = await listingRowFor(adminUserId, range);
    const detail = await detailFor(adminUserId, range);
    assert.equal(listing.totalModifications, 0);
    assert.equal(listing.hotelsEdited, 0);
    assert.equal(listing.totalModifications, detail.totalModifications);
    assert.equal(listing.hotelsEdited, detail.hotelsEdited);
  });

  it('pagination does not change the aggregate counts for a given employee', async () => {
    const range = { from: isoDate(lastMonthStart), to: isoDate(today) };
    const page1 = await request(app).get('/api/admin/onboarding-analytics/employees').set(bearer(adminToken)).query({ limit: 1, page: 1, sort: 'name_asc', ...range });
    const page2 = await request(app).get('/api/admin/onboarding-analytics/employees').set(bearer(adminToken)).query({ limit: 1, page: 2, sort: 'name_asc', ...range });
    const everyone = [...page1.body.items, ...page2.body.items];
    const row = everyone.find((r) => r.id === onboardingUserId);
    assert.ok(row);
    assert.equal(row.onboarded, 2);
  });

  it('hotel creation attribution is unaffected by later edits', async () => {
    const res = await request(app).get(`/api/admin/hotels/${hotelThisMonth}`).set(bearer(adminToken));
    assert.equal(res.body.hotel.onboardedBy.id, onboardingUserId);
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
