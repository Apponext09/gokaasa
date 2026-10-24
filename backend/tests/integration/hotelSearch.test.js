import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';
import { pool } from '../../src/db/pool.js';
import { addDays } from '../../src/domain/pricing.js';
import { localToday } from '../../src/domain/businessDate.js';

/**
 * Regression test for the public /api/hotels/search listing query (the one behind the homepage's
 * "Browse All Hotels" section and the search results page). The query used to select a non-existent
 * h.distance_km column from the hotels table, which made every search request fail with a 500.
 */

const PASSWORD = 'Strong-pass-123';
const TODAY = localToday('Asia/Kolkata');
const CHECK_IN = addDays(TODAY, 30);
const CHECK_OUT = addDays(TODAY, 31);

let app;
let adminToken;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

async function loginAs(email) {
  return (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.accessToken;
}

before(async () => {
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
  adminToken = await loginAs('admin@example.com');

  const created = await request(app)
    .post('/api/admin/hotels')
    .set(bearer(adminToken))
    .send({ name: 'Searchable Bay Hotel', city: 'Mumbai', countryCode: 'IN' });
  const hotelId = created.body.hotel.id;

  await request(app)
    .patch(`/api/admin/hotels/${hotelId}`)
    .set(bearer(adminToken))
    .send({ description: 'A bookable hotel for search tests.', starRating: 4, addressLine: '1 Bay Road', latitude: 18.94, longitude: 72.82 });

  const room = await request(app)
    .post(`/api/admin/hotels/${hotelId}/room-types`)
    .set(bearer(adminToken))
    .send({
      name: 'Deluxe Room',
      roomCode: 'DLX',
      category: 'DELUXE',
      bedType: 'KING',
      bedCount: 1,
      maxAdults: 2,
      maxChildren: 1,
      maxOccupancy: 3,
      smoking: 'NON_SMOKING',
      totalUnits: 4,
    });
  assert.equal(room.status, 201, JSON.stringify(room.body));
  const roomId = room.body.roomType.id;

  const policies = await request(app).get(`/api/admin/hotels/${hotelId}/cancellation-policies`).set(bearer(adminToken));
  const freeCancellation = policies.body.policies.find((p) => p.code === 'FREE_CANCELLATION');

  const plan = await request(app)
    .post(`/api/admin/room-types/${roomId}/rate-plans`)
    .set(bearer(adminToken))
    .send({
      code: 'RO',
      name: 'Room only',
      mealPlan: 'ROOM_ONLY',
      isRefundable: true,
      cancellationPolicyId: freeCancellation.id,
      discountPercent: 0,
      taxPercent: 12,
      feeMinor: 0,
    });
  assert.equal(plan.status, 201, JSON.stringify(plan.body));
  const planId = plan.body.ratePlan.id;

  const priced = await request(app)
    .post(`/api/admin/room-types/${roomId}/calendar/bulk`)
    .set(bearer(adminToken))
    .send({ from: CHECK_IN, to: CHECK_OUT, ratePlanId: planId, basePriceMinor: 1_000_000 });
  assert.equal(priced.status, 200, JSON.stringify(priced.body));

  // Publishing requires at least one image; inserted directly since the upload endpoint needs a real file.
  await pool.query(
    `INSERT INTO hotel_images (hotel_id, category, source_url, is_cover) VALUES ($1, 'EXTERIOR', 'https://example.com/h.jpg', true)`,
    [hotelId],
  );

  await request(app).put(`/api/admin/hotels/${hotelId}/amenities`).set(bearer(adminToken)).send({ codes: ['WIFI'] });
  await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(adminToken)).send({ action: 'SUBMIT_FOR_REVIEW' });
  await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(adminToken)).send({ action: 'MARK_READY' });
  const published = await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(adminToken)).send({ action: 'PUBLISH' });
  assert.equal(published.status, 200, JSON.stringify(published.body));
});

after(closeTestDatabase);

describe('public hotel search', () => {
  it('returns a bookable hotel for a valid stay, with no distance context', async () => {
    const res = await request(app)
      .get('/api/hotels/search')
      .query({ checkIn: CHECK_IN, checkOut: CHECK_OUT, occ: '2' });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.items.length >= 1, 'the published, priced hotel should be returned');
    const hotel = res.body.items.find((item) => item.name === 'Searchable Bay Hotel');
    assert.ok(hotel, 'the search result should include the fixture hotel');
    assert.equal(hotel.distanceKm, null, 'search has no geo context, so distance must be null, not a crash');
    assert.ok(hotel.bestOffer, 'a priced, available room should produce a bookable offer');
  });

  it('rejects a search missing required dates instead of crashing', async () => {
    const res = await request(app).get('/api/hotels/search');
    assert.equal(res.status, 422);
  });
});
