import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase, waitForJob } from '../helpers/testDb.js';
import { pool } from '../../src/db/pool.js';

const PASSWORD = 'Strong-pass-123';
let app;
let adminToken;
let managerToken;
let customerToken;

async function loginAs(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return res.body.accessToken;
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

before(async () => {
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
  await createUserWithRole({ email: 'manager@example.com', password: PASSWORD, roleCode: 'HOTEL_MANAGER' });
  await createUserWithRole({ email: 'guest@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  adminToken = await loginAs('admin@example.com');
  managerToken = await loginAs('manager@example.com');
  customerToken = await loginAs('guest@example.com');
});

after(closeTestDatabase);

describe('admin hotel management', () => {
  let hotelId;

  it('creates a manual hotel as a DRAFT with a generated slug', async () => {
    const res = await request(app)
      .post('/api/admin/hotels')
      .set(bearer(adminToken))
      .send({ name: 'Sea Breeze Test Hotel', city: 'Mumbai', countryCode: 'in' });

    assert.equal(res.status, 201);
    assert.equal(res.body.hotel.status, 'DRAFT');
    assert.equal(res.body.hotel.countryCode, 'IN');
    assert.equal(res.body.hotel.slug, 'sea-breeze-test-hotel-mumbai');
    hotelId = res.body.hotel.id;
    // Hotel managers are now scoped per hotel; assign this test's manager so later tests can act on it.
    await pool.query(`INSERT INTO hotel_managers (user_id, hotel_id) SELECT id, $2 FROM users WHERE email = $1`, ['manager@example.com', hotelId]);
  });

  it('validates input and returns field errors', async () => {
    const res = await request(app).post('/api/admin/hotels').set(bearer(adminToken)).send({ name: 'X', countryCode: 'India' });
    assert.equal(res.status, 422);
    assert.ok(res.body.error.details.some((detail) => detail.field === 'body.countryCode'));
  });

  it('keeps customers out of admin routes', async () => {
    const res = await request(app).post('/api/admin/hotels').set(bearer(customerToken)).send({ name: 'Hack', city: 'Goa', countryCode: 'IN' });
    assert.equal(res.status, 403);
  });

  it('lets managers draft and submit but not publish', async () => {
    const submit = await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(managerToken)).send({ action: 'SUBMIT_FOR_REVIEW' });
    assert.equal(submit.status, 200);
    assert.equal(submit.body.hotel.status, 'PENDING_REVIEW');

    const publish = await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(managerToken)).send({ action: 'PUBLISH' });
    assert.equal(publish.status, 403);
  });

  it('refuses invalid status jumps', async () => {
    const res = await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(adminToken)).send({ action: 'PUBLISH' });
    assert.equal(res.status, 409);
  });

  it('blocks publishing until verification requirements are met', async () => {
    await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(adminToken)).send({ action: 'MARK_READY' });
    const res = await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(adminToken)).send({ action: 'SAVE_DRAFT' });
    assert.equal(res.status, 200);
    const detail = await request(app).get(`/api/admin/hotels/${hotelId}`).set(bearer(adminToken));
    assert.ok(detail.body.hotel.publishBlockers.includes('Description'));
    assert.ok(detail.body.hotel.publishBlockers.includes('At least one image'));
  });

  it('stores amenity changes and rejects unknown codes', async () => {
    const ok = await request(app).put(`/api/admin/hotels/${hotelId}/amenities`).set(bearer(adminToken)).send({ codes: ['WIFI', 'POOL'] });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.hotel.amenities.map((a) => a.code).sort(), ['POOL', 'WIFI']);

    const bad = await request(app).put(`/api/admin/hotels/${hotelId}/amenities`).set(bearer(adminToken)).send({ codes: ['JACUZZI_DELUXE_X'] });
    assert.equal(bad.status, 422);
  });

  it('completes the full publish path once requirements are satisfied', async () => {
    await request(app)
      .patch(`/api/admin/hotels/${hotelId}`)
      .set(bearer(adminToken))
      .send({
        description: 'A test property used by the automated suite.',
        starRating: 5,
        addressLine: '1 Test Road',
        latitude: 19.06,
        longitude: 72.83,
      });
    await pool.query(
      `INSERT INTO hotel_images (hotel_id, category, source_url, is_cover) VALUES ($1, 'EXTERIOR', 'https://example.com/cover.jpg', true)`,
      [hotelId],
    );

    await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(adminToken)).send({ action: 'SUBMIT_FOR_REVIEW' });
    const ready = await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(adminToken)).send({ action: 'MARK_READY' });
    assert.equal(ready.status, 200, JSON.stringify(ready.body));

    const published = await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(adminToken)).send({ action: 'PUBLISH' });
    assert.equal(published.status, 200);
    assert.equal(published.body.hotel.status, 'PUBLISHED');
    assert.ok(published.body.hotel.publishedAt);

    const publicList = await request(app).get('/api/hotels?city=mumbai');
    assert.equal(publicList.body.items.length, 1);
    const publicDetail = await request(app).get(`/api/hotels/sea-breeze-test-hotel-mumbai`);
    assert.equal(publicDetail.status, 200);
    assert.equal(publicDetail.body.hotel.status, undefined, 'customers must not see internal status');
  });

  it('hides drafts from the public catalogue', async () => {
    await request(app).post('/api/admin/hotels').set(bearer(adminToken)).send({ name: 'Hidden Draft', city: 'Pune', countryCode: 'IN' });
    const res = await request(app).get('/api/hotels?q=hidden');
    assert.equal(res.body.items.length, 0);
  });

  it('archives a hotel and makes it read-only', async () => {
    const archive = await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(adminToken)).send({ action: 'ARCHIVE' });
    assert.equal(archive.status, 200);
    assert.equal(archive.body.hotel.status, 'ARCHIVED');

    const edit = await request(app).patch(`/api/admin/hotels/${hotelId}`).set(bearer(adminToken)).send({ name: 'Renamed Hotel' });
    assert.equal(edit.status, 409);
  });

  it('writes an audit entry for every status change', async () => {
    const { rows } = await pool.query(
      `SELECT action FROM audit_logs WHERE entity = 'hotel' AND entity_id = $1 ORDER BY id`,
      [String(hotelId)],
    );
    const actions = rows.map((row) => row.action);
    assert.ok(actions.includes('hotel.created'));
    assert.ok(actions.includes('hotel.publish'));
    assert.ok(actions.includes('hotel.archive'));
  });
});

describe('hotel onboarding (import pipeline)', () => {
  it('searches providers and returns ranked candidates with confidence scores', async () => {
    const res = await request(app)
      .post('/api/admin/hotel-import/search')
      .set(bearer(adminToken))
      .send({ query: 'Sample Sea Breeze Mumbai' });

    assert.equal(res.status, 200);
    assert.ok(res.body.results.length > 0);
    const scores = res.body.results.map((item) => item.matchConfidence);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a), 'results must be sorted by confidence');
    assert.equal(res.body.results[0].externalId, 'mock-1001');
  });

  it('imports into a draft, flags missing data for review and never publishes', async () => {
    const res = await request(app)
      .post('/api/admin/hotel-import/import')
      .set(bearer(adminToken))
      .send({ provider: 'mock', externalId: 'mock-1001', query: 'Sample Sea Breeze Mumbai' });
    assert.equal(res.status, 202);

    const job = await waitForJob(request(app), adminToken, res.body.job.id);
    assert.equal(job.status, 'REVIEW_REQUIRED');
    assert.ok(job.hotelId);
    assert.ok(job.normalizedData.missing.includes('images'));

    const hotel = await request(app).get(`/api/admin/hotels/${job.hotelId}`).set(bearer(adminToken));
    assert.equal(hotel.body.hotel.status, 'DRAFT');
    assert.equal(hotel.body.hotel.externalProvider, 'mock');
    assert.equal(hotel.body.hotel.starRating, 5, '"5 Star Hotel" must normalise to 5');
    assert.ok(hotel.body.hotel.amenities.some((a) => a.code === 'WIFI'));

    const publicList = await request(app).get('/api/hotels');
    assert.equal(publicList.body.items.some((item) => item.id === job.hotelId), false);
  });

  it('refuses to import the same external hotel twice', async () => {
    const res = await request(app)
      .post('/api/admin/hotel-import/import')
      .set(bearer(adminToken))
      .send({ provider: 'mock', externalId: 'mock-1001' });
    assert.equal(res.status, 409);
    assert.ok(res.body.error.details.hotelId);
  });

  it('records a failure with a safe message when the source has no such record', async () => {
    const res = await request(app)
      .post('/api/admin/hotel-import/import')
      .set(bearer(adminToken))
      .send({ provider: 'mock', externalId: 'does-not-exist' });
    const job = await waitForJob(request(app), adminToken, res.body.job.id);

    assert.equal(job.status, 'FAILED');
    assert.match(job.errorMessage, /no longer available/);
  });

  it('rejects providers that are not configured', async () => {
    const res = await request(app)
      .post('/api/admin/hotel-import/import')
      .set(bearer(adminToken))
      .send({ provider: 'google_places', externalId: 'ChIJ-abc' });
    assert.equal(res.status, 422);
  });

  it('shows dashboard metrics computed from stored data', async () => {
    const res = await request(app).get('/api/admin/dashboard/summary').set(bearer(adminToken));
    assert.equal(res.status, 200);
    assert.equal(res.body.onboarding.pendingVerification, 1);
    assert.equal(res.body.onboarding.failedImports30d, 1);
    assert.equal(res.body.customers.total, 1);
  });

  it('keeps import endpoints closed to customers', async () => {
    const res = await request(app).get('/api/admin/hotel-import/jobs').set(bearer(customerToken));
    assert.equal(res.status, 403);
  });
});
