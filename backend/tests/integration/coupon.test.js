import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';
import { pool } from '../../src/db/pool.js';
import { addDays } from '../../src/domain/pricing.js';
import { localToday } from '../../src/domain/businessDate.js';

const PASSWORD = 'Strong-pass-123';
const TODAY = localToday('Asia/Kolkata');
const D0 = addDays(TODAY, 40);

let app;
let adminToken, managerToken, guestToken, guestId;
let hotelId, roomTypeId, planId;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const day = (offset) => addDays(D0, offset);

async function loginAs(email) {
  return (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.accessToken;
}

async function createHold(token, { checkIn, nights = 2 } = {}) {
  const res = await request(app).post('/api/booking/holds').set(bearer(token)).send({
    hotelId, roomTypeId, ratePlanId: planId, checkIn, checkOut: addDays(checkIn, nights), rooms: 1,
    occupancy: [{ adults: 2, childAges: [] }],
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.hold;
}

async function saveGuests(token, holdId) {
  const res = await request(app).put(`/api/booking/holds/${holdId}/guests`).set(bearer(token)).send({
    primaryContact: { firstName: 'Coupon', lastName: 'Guest', email: 'coupon.guest@example.com', mobile: '+919876500009' },
    rooms: [{ roomIndex: 0, guests: [{ firstName: 'Coupon', lastName: 'Guest', age: 30 }, { firstName: 'Co', lastName: 'Traveller', age: 28 }] }],
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.hold;
}

/** Runs a hold all the way to a CONFIRMED booking via the simulated gateway. */
async function payFor(token, holdId) {
  const order = await request(app).post('/api/payments/create-order').set(bearer(token)).send({ holdId });
  assert.equal(order.status, 201, JSON.stringify(order.body));
  const capture = await request(app).post('/api/payments/dev/checkout').set(bearer(token)).send({ razorpayOrderId: order.body.orderId, outcome: 'success' });
  assert.equal(capture.status, 200, JSON.stringify(capture.body));
  const verified = await request(app).post('/api/payments/verify').set(bearer(token)).send({
    razorpay_order_id: capture.body.razorpay_order_id, razorpay_payment_id: capture.body.razorpay_payment_id, razorpay_signature: capture.body.razorpay_signature,
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  return verified.body.booking;
}

function couponBody(overrides = {}) {
  return {
    code: `TEST${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
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
  await createUserWithRole({ email: 'manager@example.com', password: PASSWORD, roleCode: 'HOTEL_OWNER' });
  await createUserWithRole({ email: 'coupon.guest@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  adminToken = await loginAs('admin@example.com');
  managerToken = await loginAs('manager@example.com');
  guestToken = await loginAs('coupon.guest@example.com');
  guestId = (await pool.query(`SELECT id FROM users WHERE email = $1`, ['coupon.guest@example.com'])).rows[0].id;

  const created = await request(app).post('/api/admin/hotels').set(bearer(adminToken)).send({ name: 'Coupon Test Hotel', city: 'Goa', countryCode: 'IN' });
  hotelId = created.body.hotel.id;
  await request(app).patch(`/api/admin/hotels/${hotelId}`).set(bearer(adminToken)).send({
    description: 'Coupon test hotel', starRating: 4, addressLine: '1 Coupon Road', latitude: 15.3, longitude: 74.0,
  });
  await pool.query(`INSERT INTO hotel_images (hotel_id, category, source_url, is_cover) VALUES ($1, 'EXTERIOR', 'https://example.com/c.jpg', true)`, [hotelId]);
  await request(app).put(`/api/admin/hotels/${hotelId}/amenities`).set(bearer(adminToken)).send({ codes: ['WIFI'] });
  for (const action of ['SUBMIT_FOR_REVIEW', 'MARK_READY', 'PUBLISH']) {
    const res = await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(adminToken)).send({ action });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  }
  const room = await request(app).post(`/api/admin/hotels/${hotelId}/room-types`).set(bearer(adminToken)).send({
    name: 'Coupon Room', roomCode: 'CPN', category: 'DELUXE', bedType: 'KING', bedCount: 1,
    maxAdults: 2, maxChildren: 1, maxOccupancy: 3, smoking: 'NON_SMOKING', totalUnits: 10,
  });
  roomTypeId = room.body.roomType.id;
  const policies = await request(app).get(`/api/admin/hotels/${hotelId}/cancellation-policies`).set(bearer(adminToken));
  const policy = policies.body.policies.find((p) => p.code === 'FREE_CANCELLATION');
  const plan = await request(app).post(`/api/admin/room-types/${roomTypeId}/rate-plans`).set(bearer(adminToken)).send({
    code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, cancellationPolicyId: policy.id, discountPercent: 0, taxPercent: 10, feeMinor: 0,
  });
  planId = plan.body.ratePlan.id;
  // 1,000,000 paise/night x 2 nights = 2,000,000 subtotal, +10% tax = 2,200,000 total before any coupon.
  await request(app).post(`/api/admin/room-types/${roomTypeId}/calendar/bulk`).set(bearer(adminToken)).send({ from: day(0), to: day(90), ratePlanId: planId, basePriceMinor: 1_000_000 });
});

after(async () => {
  await closeTestDatabase();
});

describe('admin coupon management: CRUD and RBAC', () => {
  it('ADMIN can create a coupon; a customer and a hotel owner cannot', async () => {
    const asGuest = await request(app).post('/api/admin/coupons').set(bearer(guestToken)).send(couponBody());
    assert.equal(asGuest.status, 403);
    const asManager = await request(app).post('/api/admin/coupons').set(bearer(managerToken)).send(couponBody());
    assert.equal(asManager.status, 403);

    const asAdmin = await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'ADMINONLY10' }));
    assert.equal(asAdmin.status, 201, JSON.stringify(asAdmin.body));
    assert.equal(asAdmin.body.coupon.code, 'ADMINONLY10');
  });

  it('rejects a percentage discount over 100 and an end date before the start date', async () => {
    const overPercent = await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ discountValue: 150 }));
    assert.equal(overPercent.status, 422);
    const badRange = await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ validFrom: '2026-02-01T00:00:00Z', validTo: '2026-01-01T00:00:00Z' }));
    assert.equal(badRange.status, 422);
  });

  it('lists, updates, deactivates and reactivates a coupon', async () => {
    const created = await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'LIFECYCLE1' }));
    const id = created.body.coupon.id;

    const list = await request(app).get('/api/admin/coupons?q=LIFECYCLE').set(bearer(adminToken));
    assert.equal(list.status, 200);
    assert.ok(list.body.items.some((c) => c.id === id));

    const updated = await request(app).patch(`/api/admin/coupons/${id}`).set(bearer(adminToken)).send({ discountValue: 20 });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.coupon.discountValue, 20);

    const deactivated = await request(app).patch(`/api/admin/coupons/${id}/status`).set(bearer(adminToken)).send({ isActive: false });
    assert.equal(deactivated.status, 200);
    assert.equal(deactivated.body.coupon.isActive, false);

    const asManager = await request(app).patch(`/api/admin/coupons/${id}/status`).set(bearer(managerToken)).send({ isActive: true });
    assert.equal(asManager.status, 403);
  });

  it('deletes an unused coupon but refuses to delete one that has been used', async () => {
    const unused = await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'DELETEME1' }));
    const deleted = await request(app).delete(`/api/admin/coupons/${unused.body.coupon.id}`).set(bearer(adminToken));
    assert.equal(deleted.status, 204);

    const used = await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'INUSE0001' }));
    const hold = await createHold(guestToken, { checkIn: day(1) });
    const apply = await request(app).post(`/api/booking/holds/${hold.id}/coupon`).set(bearer(guestToken)).send({ code: 'INUSE0001' });
    assert.equal(apply.status, 200, JSON.stringify(apply.body));

    const blocked = await request(app).delete(`/api/admin/coupons/${used.body.coupon.id}`).set(bearer(adminToken));
    assert.equal(blocked.status, 409);
  });
});

describe('applying a coupon to a hold', () => {
  it('a percentage coupon discounts the hold total by exactly the right amount, server-side', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'PERCENT10', discountType: 'PERCENT', discountValue: 10 }));
    const hold = await createHold(guestToken, { checkIn: day(3) });
    const beforeTotal = hold.quote.totals.total; // 2,200,000

    const applied = await request(app).post(`/api/booking/holds/${hold.id}/coupon`).set(bearer(guestToken)).send({ code: 'PERCENT10' });
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    assert.equal(applied.body.hold.quote.coupon.code, 'PERCENT10');
    assert.equal(applied.body.hold.quote.totals.couponDiscount, Math.round(beforeTotal * 0.1));
    assert.equal(applied.body.hold.quote.totals.total, beforeTotal - Math.round(beforeTotal * 0.1));
  });

  it('a fixed coupon never discounts below zero, and max_discount_minor caps a percentage coupon', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'CAPPED50', discountType: 'PERCENT', discountValue: 50, maxDiscountMinor: 50_000 }));
    const hold = await createHold(guestToken, { checkIn: day(5) });
    const applied = await request(app).post(`/api/booking/holds/${hold.id}/coupon`).set(bearer(guestToken)).send({ code: 'CAPPED50' });
    assert.equal(applied.status, 200);
    assert.equal(applied.body.hold.quote.totals.couponDiscount, 50_000, 'capped, not 50% of the total');
  });

  it('rejects an unknown code, an inactive coupon, and a coupon outside its date range', async () => {
    const hold = await createHold(guestToken, { checkIn: day(7) });
    assert.equal((await request(app).post(`/api/booking/holds/${hold.id}/coupon`).set(bearer(guestToken)).send({ code: 'DOES-NOT-EXIST' })).status, 404);

    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'INACTIVE1' }));
    const inactive = (await request(app).get('/api/admin/coupons?q=INACTIVE1').set(bearer(adminToken))).body.items[0];
    await request(app).patch(`/api/admin/coupons/${inactive.id}/status`).set(bearer(adminToken)).send({ isActive: false });
    const rejected = await request(app).post(`/api/booking/holds/${hold.id}/coupon`).set(bearer(guestToken)).send({ code: 'INACTIVE1' });
    assert.equal(rejected.status, 422);

    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'EXPIRED01', validFrom: '2020-01-01T00:00:00Z', validTo: '2020-02-01T00:00:00Z' }));
    const expired = await request(app).post(`/api/booking/holds/${hold.id}/coupon`).set(bearer(guestToken)).send({ code: 'EXPIRED01' });
    assert.equal(expired.status, 422);
  });

  it('enforces minimum booking amount and minimum nights', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'MINAMT500', minAmountMinor: 10_000_000 }));
    const cheapHold = await createHold(guestToken, { checkIn: day(9) });
    const rejectedAmt = await request(app).post(`/api/booking/holds/${cheapHold.id}/coupon`).set(bearer(guestToken)).send({ code: 'MINAMT500' });
    assert.equal(rejectedAmt.status, 422);

    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'MINNIGHTS5', minNights: 5 }));
    const shortHold = await createHold(guestToken, { checkIn: day(11), nights: 2 });
    const rejectedNights = await request(app).post(`/api/booking/holds/${shortHold.id}/coupon`).set(bearer(guestToken)).send({ code: 'MINNIGHTS5' });
    assert.equal(rejectedNights.status, 422);
  });

  it('removing a coupon restores the original total', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'REMOVEME1' }));
    const hold = await createHold(guestToken, { checkIn: day(13) });
    const original = hold.quote.totals.total;
    const applied = await request(app).post(`/api/booking/holds/${hold.id}/coupon`).set(bearer(guestToken)).send({ code: 'REMOVEME1' });
    assert.notEqual(applied.body.hold.quote.totals.total, original);

    const removed = await request(app).delete(`/api/booking/holds/${hold.id}/coupon`).set(bearer(guestToken));
    assert.equal(removed.status, 200);
    assert.equal(removed.body.hold.quote.totals.total, original);
    assert.equal(removed.body.hold.quote.coupon, null);
  });

  it('a second user cannot apply or remove a coupon on someone else\'s hold (IDOR)', async () => {
    await createUserWithRole({ email: 'other.guest@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
    const otherToken = await loginAs('other.guest@example.com');
    const hold = await createHold(guestToken, { checkIn: day(15) });
    const res = await request(app).post(`/api/booking/holds/${hold.id}/coupon`).set(bearer(otherToken)).send({ code: 'PERCENT10' });
    assert.equal(res.status, 404);
  });
});

describe('usage limits and concurrency', () => {
  it('a coupon with usage_limit 1 can only ever have one active reservation at a time', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'ONLYONCE1', usageLimit: 1 }));
    const holdA = await createHold(guestToken, { checkIn: day(17) });
    const firstApply = await request(app).post(`/api/booking/holds/${holdA.id}/coupon`).set(bearer(guestToken)).send({ code: 'ONLYONCE1' });
    assert.equal(firstApply.status, 200, JSON.stringify(firstApply.body));

    await createUserWithRole({ email: 'second.guest@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
    const secondToken = await loginAs('second.guest@example.com');
    const holdB = await createHold(secondToken, { checkIn: day(19) });
    const secondApply = await request(app).post(`/api/booking/holds/${holdB.id}/coupon`).set(bearer(secondToken)).send({ code: 'ONLYONCE1' });
    assert.equal(secondApply.status, 422, 'the slot is already held by the first guest, mid-checkout');

    // Releasing the first guest's hold gives the slot back.
    await request(app).post(`/api/booking/holds/${holdA.id}/release`).set(bearer(guestToken));
    const thirdApply = await request(app).post(`/api/booking/holds/${holdB.id}/coupon`).set(bearer(secondToken)).send({ code: 'ONLYONCE1' });
    assert.equal(thirdApply.status, 200, JSON.stringify(thirdApply.body));
  });

  it('two concurrent applies against the last remaining slot: exactly one succeeds', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'RACECOND1', usageLimit: 1 }));
    await createUserWithRole({ email: 'race.guest.a@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
    await createUserWithRole({ email: 'race.guest.b@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
    const tokenA = await loginAs('race.guest.a@example.com');
    const tokenB = await loginAs('race.guest.b@example.com');
    const holdA = await createHold(tokenA, { checkIn: day(21) });
    const holdB = await createHold(tokenB, { checkIn: day(23) });

    const [resA, resB] = await Promise.all([
      request(app).post(`/api/booking/holds/${holdA.id}/coupon`).set(bearer(tokenA)).send({ code: 'RACECOND1' }),
      request(app).post(`/api/booking/holds/${holdB.id}/coupon`).set(bearer(tokenB)).send({ code: 'RACECOND1' }),
    ]);
    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(statuses, [200, 422], 'exactly one of the two concurrent applies wins the last slot');
  });

  it('per_user_limit blocks the same user from using a coupon again on a new hold', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'ONCEPERU1', perUserLimit: 1 }));
    const holdA = await createHold(guestToken, { checkIn: day(25) });
    const first = await request(app).post(`/api/booking/holds/${holdA.id}/coupon`).set(bearer(guestToken)).send({ code: 'ONCEPERU1' });
    assert.equal(first.status, 200);

    const holdB = await createHold(guestToken, { checkIn: day(27) });
    const second = await request(app).post(`/api/booking/holds/${holdB.id}/coupon`).set(bearer(guestToken)).send({ code: 'ONCEPERU1' });
    assert.equal(second.status, 422, 'this user already has an active (pending) use of this coupon');
  });
});

describe('end-to-end: coupon survives through payment to the confirmed booking and its invoice', () => {
  it('the paid total matches the discounted amount, the booking snapshots the coupon, and the invoice shows it', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'E2ECOUPON', discountType: 'FIXED', discountValue: 100_000 }));
    const hold = await createHold(guestToken, { checkIn: day(29) });
    const preDiscountTotal = hold.quote.totals.total;
    await saveGuests(guestToken, hold.id);
    const applied = await request(app).post(`/api/booking/holds/${hold.id}/coupon`).set(bearer(guestToken)).send({ code: 'E2ECOUPON' });
    assert.equal(applied.status, 200);
    const discountedTotal = applied.body.hold.quote.totals.total;
    assert.equal(discountedTotal, preDiscountTotal - 100_000);

    const order = await request(app).post('/api/payments/create-order').set(bearer(guestToken)).send({ holdId: hold.id });
    assert.equal(order.status, 201, JSON.stringify(order.body));
    // The amount actually sent to the gateway must be the discounted total -- never the pre-coupon price.
    assert.equal(order.body.amount, discountedTotal, 'Razorpay order amount reflects the coupon discount');

    const booking = await payFor(guestToken, hold.id);
    assert.equal(booking.amounts.total, discountedTotal);
    assert.equal(booking.amounts.couponCode, 'E2ECOUPON');
    assert.equal(booking.amounts.couponDiscount, 100_000);

    const invoice = await request(app).get(`/api/bookings/${booking.id}/invoice`).set(bearer(guestToken));
    assert.equal(invoice.status, 200);
    assert.equal(invoice.headers['content-type'], 'application/pdf');
    assert.ok(invoice.body.length > 0);

    const usage = await pool.query(`SELECT status, booking_id FROM coupon_usages WHERE hold_id = $1`, [hold.id]);
    assert.equal(usage.rows[0].status, 'CONFIRMED');
    assert.equal(usage.rows[0].booking_id, booking.id);
  });

  it('an expired/released hold releases its coupon reservation, freeing the usage slot', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'RELEASEME', usageLimit: 1 }));
    const hold = await createHold(guestToken, { checkIn: day(31) });
    await request(app).post(`/api/booking/holds/${hold.id}/coupon`).set(bearer(guestToken)).send({ code: 'RELEASEME' });
    await request(app).post(`/api/booking/holds/${hold.id}/release`).set(bearer(guestToken));

    const row = (await pool.query(`SELECT used_count FROM coupons WHERE code = 'RELEASEME'`)).rows[0];
    assert.equal(row.used_count, 0, 'the slot was given back when the hold was released');

    const holdB = await createHold(guestToken, { checkIn: day(33) });
    const reapplied = await request(app).post(`/api/booking/holds/${holdB.id}/coupon`).set(bearer(guestToken)).send({ code: 'RELEASEME' });
    assert.equal(reapplied.status, 200, 'the same coupon can be used again now that the slot is free');
  });
});

describe('price-manipulation protection', () => {
  it('a booking confirms at the server-computed discounted amount even if the browser never supplied one', async () => {
    // The browser never sends a discount value anywhere in this flow -- createOrder reads only the
    // hold's own stored total_minor, which the apply-coupon endpoint computed server-side.
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'NOCLIENT1', discountType: 'PERCENT', discountValue: 25 }));
    const hold = await createHold(guestToken, { checkIn: day(35) });
    await saveGuests(guestToken, hold.id);
    const applied = await request(app).post(`/api/booking/holds/${hold.id}/coupon`).set(bearer(guestToken)).send({ code: 'NOCLIENT1' });
    const expectedTotal = applied.body.hold.quote.totals.total;

    const order = await request(app).post('/api/payments/create-order').set(bearer(guestToken)).send({ holdId: hold.id });
    assert.equal(order.body.amount, expectedTotal);
    const booking = await payFor(guestToken, hold.id);
    assert.equal(booking.amounts.total, expectedTotal);
  });

  it('a re-quote after the coupon was applied keeps it applied and does not report a false price change', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send(couponBody({ code: 'REQUOTE01', discountType: 'PERCENT', discountValue: 15 }));
    const hold = await createHold(guestToken, { checkIn: day(37) });
    const applied = await request(app).post(`/api/booking/holds/${hold.id}/coupon`).set(bearer(guestToken)).send({ code: 'REQUOTE01' });
    const totalWithCoupon = applied.body.hold.quote.totals.total;

    const requoted = await request(app).post(`/api/booking/holds/${hold.id}/requote`).set(bearer(guestToken));
    assert.equal(requoted.status, 200, JSON.stringify(requoted.body));
    assert.equal(requoted.body.changed, false, 'nothing about the room price actually changed, so no false alarm');
    assert.equal(requoted.body.hold.quote.totals.total, totalWithCoupon);
    assert.equal(requoted.body.hold.quote.coupon.code, 'REQUOTE01');
  });
});
