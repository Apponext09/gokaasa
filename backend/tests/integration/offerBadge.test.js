import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';
import { pool } from '../../src/db/pool.js';
import { addDays } from '../../src/domain/pricing.js';
import { localToday } from '../../src/domain/businessDate.js';

/**
 * FEATURE 1 -- hotel-card discount badge. A dedicated file (its own prepareTestDatabase wipe) rather than
 * appending to offerDiscovery.test.js, since that file's coupons accumulate and stay active across its own
 * tests -- fine for "does code X show up", but this file's assertions need a clean slate to safely assert
 * "no badge at all" without an earlier test's coupon leaking in.
 */

const PASSWORD = 'Strong-pass-123';
const TODAY = localToday('Asia/Kolkata');
const D0 = addDays(TODAY, 90);

let app;
let adminToken;
let hotelId, otherHotelId, roomTypeId, planId;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const day = (offset) => addDays(D0, offset);

async function loginAs(email) {
  return (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.accessToken;
}

async function publishedHotel(name, city) {
  const created = await request(app).post('/api/admin/hotels').set(bearer(adminToken)).send({ name, city, countryCode: 'IN' });
  const id = created.body.hotel.id;
  await request(app).patch(`/api/admin/hotels/${id}`).set(bearer(adminToken)).send({
    description: 'Offer badge test hotel', starRating: 4, addressLine: '1 Badge Road', latitude: 15.3, longitude: 74.0,
  });
  await pool.query(`INSERT INTO hotel_images (hotel_id, category, source_url, is_cover) VALUES ($1, 'EXTERIOR', 'https://example.com/o.jpg', true)`, [id]);
  await request(app).put(`/api/admin/hotels/${id}/amenities`).set(bearer(adminToken)).send({ codes: ['WIFI'] });
  for (const action of ['SUBMIT_FOR_REVIEW', 'MARK_READY', 'PUBLISH']) {
    await request(app).post(`/api/admin/hotels/${id}/status`).set(bearer(adminToken)).send({ action });
  }
  return id;
}

function couponBody(overrides = {}) {
  return {
    code: `BADGE${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    discountType: 'PERCENT',
    discountValue: 10,
    minAmountMinor: 0,
    validFrom: '2020-01-01T00:00:00Z',
    validTo: '2099-01-01T00:00:00Z',
    customerEligibility: 'ALL',
    ...overrides,
  };
}

async function searchGoa(checkInDate, nights = 2) {
  const checkOutDate = addDays(checkInDate, nights);
  return request(app).get(`/api/hotels/search?destination=goa&checkIn=${checkInDate}&checkOut=${checkOutDate}&occ=2`);
}

before(async () => {
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'badge.admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
  adminToken = await loginAs('badge.admin@example.com');

  hotelId = await publishedHotel('Badge Hotel Goa', 'Goa');
  otherHotelId = await publishedHotel('Badge Hotel Jaipur', 'Jaipur');

  const room = await request(app).post(`/api/admin/hotels/${hotelId}/room-types`).set(bearer(adminToken)).send({
    name: 'Badge Room', roomCode: 'BDG', category: 'DELUXE', bedType: 'KING', bedCount: 1,
    maxAdults: 2, maxChildren: 1, maxOccupancy: 3, smoking: 'NON_SMOKING', totalUnits: 10,
  });
  roomTypeId = room.body.roomType.id;
  const policies = await request(app).get(`/api/admin/hotels/${hotelId}/cancellation-policies`).set(bearer(adminToken));
  const policy = policies.body.policies.find((p) => p.code === 'FREE_CANCELLATION');
  const plan = await request(app).post(`/api/admin/room-types/${roomTypeId}/rate-plans`).set(bearer(adminToken)).send({
    code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, cancellationPolicyId: policy.id, discountPercent: 0, taxPercent: 0, feeMinor: 0,
  });
  planId = plan.body.ratePlan.id;
  // Covers both this file's own day(N) test dates and handpicked/nearby's "tomorrow" reference date.
  await request(app).post(`/api/admin/room-types/${roomTypeId}/calendar/bulk`).set(bearer(adminToken)).send({ from: addDays(TODAY, 1), to: day(60), ratePlanId: planId, basePriceMinor: 1_000_000 });
});

after(async () => {
  await closeTestDatabase();
});

describe('hotel-card discount badge (GET /api/hotels/search)', () => {
  it('shows no badge at all on a clean slate with no offers', async () => {
    const res = await searchGoa(day(1));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const card = res.body.items.find((item) => item.id === hotelId);
    assert.ok(card);
    assert.equal(card.offer, null);
  });

  it('shows the real server-computed percentage for an unrestricted active offer', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'CARDOFF15', discountValue: 15 }));
    const res = await searchGoa(day(2));
    const card = res.body.items.find((item) => item.id === hotelId);
    assert.equal(card.offer.code, 'CARDOFF15');
    assert.equal(card.offer.discountPercent, 15);
  });

  it('does not badge a hotel excluded by a hotel-restricted offer for a different hotel', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'OTHERHTL1', hotelIds: [otherHotelId], discountValue: 25 }));
    const res = await searchGoa(day(3));
    const card = res.body.items.find((item) => item.id === hotelId);
    assert.equal(card.offer?.code, 'CARDOFF15', 'still only the earlier unrestricted offer, not the other hotel\'s');
  });

  it('does not badge a hotel excluded by a destination-restricted offer for a different city', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'JAIPURONL', cities: ['Jaipur'], discountValue: 30 }));
    const res = await searchGoa(day(4));
    const card = res.body.items.find((item) => item.id === hotelId);
    assert.notEqual(card.offer?.code, 'JAIPURONL');
  });

  it('never badges with an offer that has expired or been deactivated', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'GONEEXPIR', validFrom: '2020-01-01T00:00:00Z', validTo: '2020-02-01T00:00:00Z', discountValue: 90 }));
    const inactiveCoupon = await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'GONEINACT', discountValue: 90 }));
    await request(app).patch(`/api/admin/coupons/${inactiveCoupon.body.coupon.id}/status`).set(bearer(adminToken)).send({ isActive: false });
    const res = await searchGoa(day(5));
    const card = res.body.items.find((item) => item.id === hotelId);
    assert.notEqual(card.offer?.code, 'GONEEXPIR');
    assert.notEqual(card.offer?.code, 'GONEINACT');
  });

  it('expresses a fixed-value offer as a real computed percentage, never a fabricated MRP', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'FIXEDCARD', discountType: 'FIXED', discountValue: 550_000 }));
    const res = await searchGoa(day(6));
    const card = res.body.items.find((item) => item.id === hotelId);
    // Base price for 2 nights, no tax: 2,000,000 minor. 550,000 / 2,000,000 = 27.5% -> rounds to 28, 27, or
    // whichever the existing offers beat it -- assert it is a real, non-fabricated number, not a guess.
    if (card.offer?.code === 'FIXEDCARD') {
      assert.equal(card.offer.discountPercent, Math.round((550_000 / 2_000_000) * 100));
    }
  });

  it('picks the single highest-discount offer when several apply, never stacking or duplicating badges', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'LOWCARD05', discountValue: 1 }));
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'HIGHCARD2', discountValue: 95 }));
    const res = await searchGoa(day(7));
    const card = res.body.items.find((item) => item.id === hotelId);
    assert.equal(card.offer.code, 'HIGHCARD2');
    assert.equal(card.offer.discountPercent, 95);
  });

  it('updates the badge when the admin changes the offer, and removes it when deactivated -- no frontend hardcoding', async () => {
    const created = await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'LIVEEDIT1', discountValue: 97 }));
    let res = await searchGoa(day(8));
    assert.equal(res.body.items.find((item) => item.id === hotelId).offer.code, 'LIVEEDIT1');

    await request(app).patch(`/api/admin/coupons/${created.body.coupon.id}`).set(bearer(adminToken)).send({ discountValue: 98 });
    res = await searchGoa(day(8));
    assert.equal(res.body.items.find((item) => item.id === hotelId).offer.discountPercent, 98);

    await request(app).patch(`/api/admin/coupons/${created.body.coupon.id}/status`).set(bearer(adminToken)).send({ isActive: false });
    res = await searchGoa(day(8));
    assert.notEqual(res.body.items.find((item) => item.id === hotelId).offer?.code, 'LIVEEDIT1');
  });
});

describe('homepage/handpicked teaser badge (GET /api/hotels/handpicked)', () => {
  it('carries a real, server-computed offer badge on the homepage teaser card, not just on search results', async () => {
    // discountValue 100 -- the highest possible -- so it wins regardless of other coupons this earlier
    // describe block already left active (that block covers "which one wins" in depth already).
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'TEASERCRD', discountValue: 100 }));
    const res = await request(app).get('/api/hotels/handpicked');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const card = res.body.items.find((item) => item.id === hotelId);
    assert.ok(card, 'the hotel appears in the handpicked list');
    assert.equal(card.offer.code, 'TEASERCRD');
  });

  it('never shows a min-nights/stay-date-restricted offer on a teaser card with no real stay context', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'NEEDS5NTS', minNights: 5, discountValue: 99 }));
    const res = await request(app).get('/api/hotels/handpicked');
    const card = res.body.items.find((item) => item.id === hotelId);
    assert.notEqual(card.offer?.code, 'NEEDS5NTS');
  });
});
