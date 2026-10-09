import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';
import { pool } from '../../src/db/pool.js';
import { addDays } from '../../src/domain/pricing.js';
import { localToday } from '../../src/domain/businessDate.js';

const PASSWORD = 'Strong-pass-123';
const TODAY = localToday('Asia/Kolkata');
const D0 = addDays(TODAY, 60);

let app;
let adminToken, guestToken;
let hotelId, otherHotelId, roomTypeId, planId;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const day = (offset) => addDays(D0, offset);

async function loginAs(email) {
  return (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.accessToken;
}

async function publishedHotel(name, city = 'Goa') {
  const created = await request(app).post('/api/admin/hotels').set(bearer(adminToken)).send({ name, city, countryCode: 'IN' });
  const id = created.body.hotel.id;
  await request(app).patch(`/api/admin/hotels/${id}`).set(bearer(adminToken)).send({
    description: 'Offer discovery test hotel', starRating: 4, addressLine: '1 Offer Road', latitude: 15.3, longitude: 74.0,
  });
  await pool.query(`INSERT INTO hotel_images (hotel_id, category, source_url, is_cover) VALUES ($1, 'EXTERIOR', 'https://example.com/o.jpg', true)`, [id]);
  await request(app).put(`/api/admin/hotels/${id}/amenities`).set(bearer(adminToken)).send({ codes: ['WIFI'] });
  for (const action of ['SUBMIT_FOR_REVIEW', 'MARK_READY', 'PUBLISH']) {
    await request(app).post(`/api/admin/hotels/${id}/status`).set(bearer(adminToken)).send({ action });
  }
  return id;
}

async function createHold(token, { checkIn, nights = 2, hotel = hotelId } = {}) {
  const res = await request(app).post('/api/booking/holds').set(bearer(token)).send({
    hotelId: hotel, roomTypeId, ratePlanId: planId, checkIn, checkOut: addDays(checkIn, nights), rooms: 1,
    occupancy: [{ adults: 2, childAges: [] }],
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.hold;
}

function couponBody(overrides = {}) {
  return {
    code: `DISC${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    discountType: 'PERCENT',
    discountValue: 10,
    minAmountMinor: 0,
    validFrom: '2020-01-01T00:00:00Z',
    validTo: '2099-01-01T00:00:00Z',
    customerEligibility: 'ALL',
    ...overrides,
  };
}

before(async () => {
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
  await createUserWithRole({ email: 'discovery.guest@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  adminToken = await loginAs('admin@example.com');
  guestToken = await loginAs('discovery.guest@example.com');

  hotelId = await publishedHotel('Discovery Hotel Goa', 'Goa');
  otherHotelId = await publishedHotel('Discovery Hotel Jaipur', 'Jaipur');

  const room = await request(app).post(`/api/admin/hotels/${hotelId}/room-types`).set(bearer(adminToken)).send({
    name: 'Discovery Room', roomCode: 'DSC', category: 'DELUXE', bedType: 'KING', bedCount: 1,
    maxAdults: 2, maxChildren: 1, maxOccupancy: 3, smoking: 'NON_SMOKING', totalUnits: 10,
  });
  roomTypeId = room.body.roomType.id;
  const policies = await request(app).get(`/api/admin/hotels/${hotelId}/cancellation-policies`).set(bearer(adminToken));
  const policy = policies.body.policies.find((p) => p.code === 'FREE_CANCELLATION');
  const plan = await request(app).post(`/api/admin/room-types/${roomTypeId}/rate-plans`).set(bearer(adminToken)).send({
    code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, cancellationPolicyId: policy.id, discountPercent: 0, taxPercent: 10, feeMinor: 0,
  });
  planId = plan.body.ratePlan.id;
  await request(app).post(`/api/admin/room-types/${roomTypeId}/calendar/bulk`).set(bearer(adminToken)).send({ from: day(0), to: day(90), ratePlanId: planId, basePriceMinor: 1_000_000 });
});

after(async () => {
  await closeTestDatabase();
});

describe('public offers discovery (GET /api/offers)', () => {
  it('is public (no auth) and returns an active, in-date coupon', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'PUBLIC001', discountType: 'PERCENT', discountValue: 15 }));
    const res = await request(app).get('/api/offers');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const item = res.body.items.find((o) => o.code === 'PUBLIC001');
    assert.ok(item, 'the active coupon is in the public list');
    assert.equal(item.discountType, 'PERCENT');
    assert.equal(item.discountValue, 15);
    assert.ok(item.title.includes('15%'));
  });

  it('excludes an inactive coupon', async () => {
    const created = await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'INACTIVEP' }));
    await request(app).patch(`/api/admin/coupons/${created.body.coupon.id}/status`).set(bearer(adminToken)).send({ isActive: false });
    const res = await request(app).get('/api/offers');
    assert.equal(res.body.items.some((o) => o.code === 'INACTIVEP'), false);
  });

  it('excludes an already-expired coupon', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'EXPIREDP', validFrom: '2020-01-01T00:00:00Z', validTo: '2020-02-01T00:00:00Z' }));
    const res = await request(app).get('/api/offers');
    assert.equal(res.body.items.some((o) => o.code === 'EXPIREDP'), false);
  });

  it('excludes a not-yet-valid (future) coupon', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'FUTUREP0', validFrom: '2099-01-01T00:00:00Z', validTo: '2099-06-01T00:00:00Z' }));
    const res = await request(app).get('/api/offers');
    assert.equal(res.body.items.some((o) => o.code === 'FUTUREP0'), false);
  });

  it('excludes a coupon that has exhausted its global usage limit', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'EXHAUSTED', usageLimit: 1 }));
    const hold = await createHold(guestToken, { checkIn: day(1) });
    await request(app).post(`/api/booking/holds/${hold.id}/coupon`).set(bearer(guestToken)).send({ code: 'EXHAUSTED' });
    const res = await request(app).get('/api/offers');
    assert.equal(res.body.items.some((o) => o.code === 'EXHAUSTED'), false, 'its one slot is already reserved (pending)');
  });

  it('never exposes admin-only fields', async () => {
    const res = await request(app).get('/api/offers');
    for (const item of res.body.items) {
      assert.equal('created_by' in item, false);
      assert.equal('createdBy' in item, false);
      assert.equal('usedCount' in item, false);
      assert.equal('usageLimit' in item, false);
      assert.equal('perUserLimit' in item, false);
    }
  });

  it('reflects hotel and destination restrictions in the response', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'HOTELREST', hotelIds: [hotelId], cities: ['Goa'] }));
    const res = await request(app).get('/api/offers');
    const item = res.body.items.find((o) => o.code === 'HOTELREST');
    assert.ok(item);
    assert.deepEqual(item.hotels.map((h) => h.id), [hotelId]);
    assert.deepEqual(item.destinations, ['Goa']);
  });
});

describe('hold-scoped applicable offers (GET /api/booking/holds/:id/coupons)', () => {
  it('returns a coupon the hold actually qualifies for, reusing the real eligibility check', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'HOLDOK001', discountType: 'FIXED', discountValue: 50_000 }));
    const hold = await createHold(guestToken, { checkIn: day(3) });
    const res = await request(app).get(`/api/booking/holds/${hold.id}/coupons`).set(bearer(guestToken));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const item = res.body.items.find((o) => o.code === 'HOLDOK001');
    assert.ok(item);
    assert.equal(item.discountMinor, 50_000);
  });

  it('excludes a coupon whose minimum booking amount this hold does not meet', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'TOOBIGMIN', minAmountMinor: 50_000_000 }));
    const hold = await createHold(guestToken, { checkIn: day(5) });
    const res = await request(app).get(`/api/booking/holds/${hold.id}/coupons`).set(bearer(guestToken));
    assert.equal(res.body.items.some((o) => o.code === 'TOOBIGMIN'), false);
  });

  it('excludes a coupon whose minimum nights this hold does not meet', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'TOOFEWNIG', minNights: 10 }));
    const hold = await createHold(guestToken, { checkIn: day(7), nights: 2 });
    const res = await request(app).get(`/api/booking/holds/${hold.id}/coupons`).set(bearer(guestToken));
    assert.equal(res.body.items.some((o) => o.code === 'TOOFEWNIG'), false);
  });

  it('excludes a coupon restricted to a different hotel', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'OTHERHTEL', hotelIds: [otherHotelId] }));
    const hold = await createHold(guestToken, { checkIn: day(9), hotel: hotelId });
    const res = await request(app).get(`/api/booking/holds/${hold.id}/coupons`).set(bearer(guestToken));
    assert.equal(res.body.items.some((o) => o.code === 'OTHERHTEL'), false);
  });

  it('a second user cannot read another user\'s hold offers (IDOR)', async () => {
    await createUserWithRole({ email: 'other.discovery@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
    const otherToken = await loginAs('other.discovery@example.com');
    const hold = await createHold(guestToken, { checkIn: day(11) });
    const res = await request(app).get(`/api/booking/holds/${hold.id}/coupons`).set(bearer(otherToken));
    assert.equal(res.status, 404);
  });

  it('a coupon discovered here can still be applied through the real endpoint, and the server computes the same discount', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'DISCOVAPPLY', discountType: 'PERCENT', discountValue: 20 }));
    const hold = await createHold(guestToken, { checkIn: day(13) });
    const discovered = await request(app).get(`/api/booking/holds/${hold.id}/coupons`).set(bearer(guestToken));
    const found = discovered.body.items.find((o) => o.code === 'DISCOVAPPLY');
    assert.ok(found);

    const applied = await request(app).post(`/api/booking/holds/${hold.id}/coupon`).set(bearer(guestToken)).send({ code: found.code });
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    assert.equal(applied.body.hold.quote.totals.couponDiscount, found.discountMinor, 'discovery and application agree -- both call the same pricing logic');
  });

  it('404s for a hold that does not exist, same as every other hold endpoint', async () => {
    const res = await request(app).get('/api/booking/holds/999999/coupons').set(bearer(guestToken));
    assert.equal(res.status, 404);
  });
});
