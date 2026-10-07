import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';
import { pool } from '../../src/db/pool.js';
import { addDays } from '../../src/domain/pricing.js';
import { localToday } from '../../src/domain/businessDate.js';

const MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'gokaasa-homepage-'));
process.env.MEDIA_DIR = MEDIA_DIR;

const PASSWORD = 'Strong-pass-123';
const TODAY = localToday('Asia/Kolkata');
const TOMORROW = addDays(TODAY, 1);

// A search origin, plus hotels at known distances from it (1 degree of latitude is ~111km).
const ORIGIN = { lat: 19.0, lng: 72.8 };
const NEAR_A = { latitude: 19.0, longitude: 72.8 }; // ~0km
const NEAR_B = { latitude: 19.09, longitude: 72.8 }; // ~10km
const FAR_C = { latitude: 19.5, longitude: 72.8 }; // ~55.5km -- outside the default 25km radius

let app;
let adminToken;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

async function loginAs(email) {
  return (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.accessToken;
}

async function publishedHotel(name, { latitude, longitude } = {}) {
  const created = await request(app).post('/api/admin/hotels').set(bearer(adminToken)).send({ name, city: 'Mumbai', countryCode: 'IN' });
  const id = created.body.hotel.id;
  await request(app)
    .patch(`/api/admin/hotels/${id}`)
    .set(bearer(adminToken))
    .send({ description: 'Homepage test hotel', starRating: 4, addressLine: '1 Homepage Road', latitude, longitude });
  await pool.query(`INSERT INTO hotel_images (hotel_id, category, source_url, is_cover) VALUES ($1, 'EXTERIOR', 'https://example.com/h.jpg', true)`, [id]);
  await request(app).put(`/api/admin/hotels/${id}/amenities`).set(bearer(adminToken)).send({ codes: ['WIFI'] });
  for (const action of ['SUBMIT_FOR_REVIEW', 'MARK_READY', 'PUBLISH']) {
    const res = await request(app).post(`/api/admin/hotels/${id}/status`).set(bearer(adminToken)).send({ action });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  }
  return id;
}

async function priceForTomorrow(hotelId, { basePriceMinor = 1_000_000 } = {}) {
  const room = await request(app).post(`/api/admin/hotels/${hotelId}/room-types`).set(bearer(adminToken)).send({
    name: 'Deluxe Room', roomCode: 'DLX', category: 'DELUXE', bedType: 'KING', bedCount: 1,
    maxAdults: 2, maxChildren: 1, maxOccupancy: 3, smoking: 'NON_SMOKING', totalUnits: 4,
  });
  assert.equal(room.status, 201, JSON.stringify(room.body));
  const roomId = room.body.roomType.id;

  const policies = await request(app).get(`/api/admin/hotels/${hotelId}/cancellation-policies`).set(bearer(adminToken));
  const policy = policies.body.policies.find((p) => p.code === 'FREE_CANCELLATION');
  const plan = await request(app).post(`/api/admin/room-types/${roomId}/rate-plans`).set(bearer(adminToken)).send({
    code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, cancellationPolicyId: policy.id,
    discountPercent: 15, taxPercent: 12, feeMinor: 0,
  });
  assert.equal(plan.status, 201, JSON.stringify(plan.body));

  const priced = await request(app)
    .post(`/api/admin/room-types/${roomId}/calendar/bulk`)
    .set(bearer(adminToken))
    .send({ from: TOMORROW, to: TOMORROW, ratePlanId: plan.body.ratePlan.id, basePriceMinor });
  assert.equal(priced.status, 200, JSON.stringify(priced.body));
}

before(async () => {
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
  adminToken = await loginAs('admin@example.com');
});

after(async () => {
  await closeTestDatabase();
  rmSync(MEDIA_DIR, { recursive: true, force: true });
});

describe('GET /api/hotels/nearby', () => {
  it('rejects an invalid latitude, longitude or radius before touching the database', async () => {
    assert.equal((await request(app).get('/api/hotels/nearby?lat=91&lng=72.8')).status, 422);
    assert.equal((await request(app).get('/api/hotels/nearby?lat=19&lng=181')).status, 422);
    assert.equal((await request(app).get('/api/hotels/nearby?lat=19&lng=72.8&radiusKm=-5')).status, 422);
    assert.equal((await request(app).get('/api/hotels/nearby?lat=19&lng=72.8&radiusKm=500')).status, 422, 'radius is capped');
    assert.equal((await request(app).get('/api/hotels/nearby?lat=not-a-number&lng=72.8')).status, 422);
  });

  it('returns hotels within the radius, nearest first, with real distances and prices', async () => {
    const nearA = await publishedHotel('Homepage Near Hotel A', NEAR_A);
    const nearB = await publishedHotel('Homepage Near Hotel B', NEAR_B);
    await priceForTomorrow(nearA, { basePriceMinor: 2_000_000 });
    await priceForTomorrow(nearB, { basePriceMinor: 1_000_000 });

    const res = await request(app).get(`/api/hotels/nearby?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}&radiusKm=25`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const ids = res.body.items.map((item) => item.id);
    assert.ok(ids.indexOf(nearA) < ids.indexOf(nearB), 'the closer hotel (A, ~0km) sorts before the farther one (B, ~10km)');

    const a = res.body.items.find((item) => item.id === nearA);
    assert.ok(a.distanceKm < 1, `hotel A should be ~0km away, got ${a.distanceKm}`);
    const b = res.body.items.find((item) => item.id === nearB);
    assert.ok(b.distanceKm > 8 && b.distanceKm < 12, `hotel B should be ~10km away, got ${b.distanceKm}`);

    assert.ok(a.price.amountMinor > 0);
    assert.equal(a.price.discountPercent, 15, 'the 15% rate-plan discount is reflected in the teaser price');
    assert.ok(a.price.originalAmountMinor > a.price.amountMinor);
  });

  it('excludes a hotel outside the requested radius, but includes it once the radius is widened', async () => {
    const farHotel = await publishedHotel('Homepage Far Hotel', FAR_C);
    await priceForTomorrow(farHotel);

    const narrow = await request(app).get(`/api/hotels/nearby?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}&radiusKm=25`);
    assert.equal(narrow.status, 200);
    assert.equal(narrow.body.items.some((item) => item.id === farHotel), false, 'a hotel ~55km away is outside a 25km radius');

    const wide = await request(app).get(`/api/hotels/nearby?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}&radiusKm=100`);
    assert.equal(wide.status, 200);
    assert.equal(wide.body.items.some((item) => item.id === farHotel), true, 'the same hotel is included once the radius covers it');
  });

  it('returns an empty list, not an error, when nothing is nearby', async () => {
    const res = await request(app).get('/api/hotels/nearby?lat=0&lng=0&radiusKm=25');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.items, []);
  });

  it('exposes only public fields -- no internal hotel columns leak through', async () => {
    const res = await request(app).get(`/api/hotels/nearby?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}&radiusKm=100`);
    assert.equal(res.status, 200);
    assert.ok(res.body.items.length > 0);
    for (const key of ['status', 'createdBy', 'updatedBy', 'externalProvider', 'externalId', 'archivedAt', 'deletedAt']) {
      assert.equal(key in res.body.items[0], false, `"${key}" must not appear in the public nearby response`);
    }
  });

  it('does not affect the existing destination/date hotel search', async () => {
    const res = await request(app).get(`/api/hotels/search?checkIn=${TOMORROW}&checkOut=${addDays(TOMORROW, 1)}&occ=2`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.items));
  });
});

describe('GET /api/hotels/handpicked', () => {
  it('ranks published hotels without requiring any location, and never includes a draft hotel', async () => {
    const draft = await request(app).post('/api/admin/hotels').set(bearer(adminToken)).send({ name: 'Still A Draft Hotel', city: 'Pune', countryCode: 'IN' });

    const res = await request(app).get('/api/hotels/handpicked?limit=24');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.items.length > 0, 'the published hotels created in earlier tests are picked up');
    assert.equal(res.body.items.some((item) => item.id === draft.body.hotel.id), false, 'a draft hotel never appears in a public listing');
    assert.ok(res.body.items.every((item) => item.distanceKm === null), 'handpicked has no location context');
  });
});

describe('POST /api/newsletter/subscribe', () => {
  it('subscribes a valid email, is idempotent on a repeat, and rejects an invalid one', async () => {
    const first = await request(app).post('/api/newsletter/subscribe').send({ email: 'Reader@Example.com' });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.email, 'reader@example.com');

    const repeat = await request(app).post('/api/newsletter/subscribe').send({ email: 'reader@example.com' });
    assert.equal(repeat.status, 201, JSON.stringify(repeat.body));

    const invalid = await request(app).post('/api/newsletter/subscribe').send({ email: 'not-an-email' });
    assert.equal(invalid.status, 422);

    const stored = await pool.query(`SELECT COUNT(*)::int AS n FROM newsletter_subscribers WHERE email = 'reader@example.com'`);
    assert.equal(stored.rows[0].n, 1, 'a repeat subscribe never creates a second row');
  });
});
