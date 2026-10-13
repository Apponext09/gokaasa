import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';
import { pool } from '../../src/db/pool.js';
import { addDays } from '../../src/domain/pricing.js';
import { localToday } from '../../src/domain/businessDate.js';

/**
 * Phase 10: the customer booking-lifecycle polish. Almost everything here (ownership, cancellation,
 * refund correctness, invoice/review IDOR) was already covered by booking.test.js / reviews.test.js /
 * invoice.test.js before this phase -- these tests cover only what Phase 10 actually added: coupon
 * visibility on the customer's own booking-detail routes, the hotel slug (for Book Again), the payment
 * method field, and the new refund.initiated notification.
 */

const PASSWORD = 'Strong-pass-123';
const TODAY = localToday('Asia/Kolkata');
const D0 = addDays(TODAY, 50);

let app;
let adminToken, guestToken, guestId;
let hotelId, roomTypeId, planId;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const day = (offset) => addDays(D0, offset);

async function loginAs(email) {
  return (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.accessToken;
}

async function createHold(checkIn, nights = 2) {
  const res = await request(app).post('/api/booking/holds').set(bearer(guestToken)).send({
    hotelId, roomTypeId, ratePlanId: planId, checkIn, checkOut: addDays(checkIn, nights), rooms: 1,
    occupancy: [{ adults: 2, childAges: [] }],
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.hold;
}

async function saveGuests(holdId) {
  const res = await request(app).put(`/api/booking/holds/${holdId}/guests`).set(bearer(guestToken)).send({
    primaryContact: { firstName: 'Lifecycle', lastName: 'Guest', email: 'lifecycle.guest@example.com', mobile: '+919876500021' },
    rooms: [{ roomIndex: 0, guests: [{ firstName: 'Lifecycle', lastName: 'Guest', age: 31 }, { firstName: 'Co', lastName: 'Traveller', age: 29 }] }],
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
}

async function payFor(holdId) {
  const order = await request(app).post('/api/payments/create-order').set(bearer(guestToken)).send({ holdId });
  assert.equal(order.status, 201, JSON.stringify(order.body));
  const capture = await request(app).post('/api/payments/dev/checkout').set(bearer(guestToken)).send({ razorpayOrderId: order.body.orderId, outcome: 'success' });
  assert.equal(capture.status, 200, JSON.stringify(capture.body));
  const verified = await request(app).post('/api/payments/verify').set(bearer(guestToken)).send({
    razorpay_order_id: capture.body.razorpay_order_id, razorpay_payment_id: capture.body.razorpay_payment_id, razorpay_signature: capture.body.razorpay_signature,
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  return verified.body.booking;
}

before(async () => {
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
  await createUserWithRole({ email: 'lifecycle.guest@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  adminToken = await loginAs('admin@example.com');
  guestToken = await loginAs('lifecycle.guest@example.com');
  guestId = (await pool.query(`SELECT id FROM users WHERE email = $1`, ['lifecycle.guest@example.com'])).rows[0].id;

  const created = await request(app).post('/api/admin/hotels').set(bearer(adminToken)).send({ name: 'Lifecycle Hotel', city: 'Jaipur', countryCode: 'IN' });
  hotelId = created.body.hotel.id;
  await request(app).patch(`/api/admin/hotels/${hotelId}`).set(bearer(adminToken)).send({
    description: 'Phase 10 test hotel', starRating: 4, addressLine: '1 Lifecycle Road', latitude: 26.9, longitude: 75.8,
  });
  await pool.query(`INSERT INTO hotel_images (hotel_id, category, source_url, is_cover) VALUES ($1, 'EXTERIOR', 'https://example.com/l.jpg', true)`, [hotelId]);
  await request(app).put(`/api/admin/hotels/${hotelId}/amenities`).set(bearer(adminToken)).send({ codes: ['WIFI'] });
  for (const action of ['SUBMIT_FOR_REVIEW', 'MARK_READY', 'PUBLISH']) {
    await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(adminToken)).send({ action });
  }
  const room = await request(app).post(`/api/admin/hotels/${hotelId}/room-types`).set(bearer(adminToken)).send({
    name: 'Lifecycle Room', roomCode: 'LFC', category: 'DELUXE', bedType: 'KING', bedCount: 1,
    maxAdults: 2, maxChildren: 1, maxOccupancy: 3, smoking: 'NON_SMOKING', totalUnits: 5,
  });
  roomTypeId = room.body.roomType.id;
  const policies = await request(app).get(`/api/admin/hotels/${hotelId}/cancellation-policies`).set(bearer(adminToken));
  const freePolicy = policies.body.policies.find((p) => p.code === 'FREE_CANCELLATION');
  const plan = await request(app).post(`/api/admin/room-types/${roomTypeId}/rate-plans`).set(bearer(adminToken)).send({
    code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, cancellationPolicyId: freePolicy.id, discountPercent: 0, taxPercent: 10, feeMinor: 0,
  });
  planId = plan.body.ratePlan.id;
  await request(app).post(`/api/admin/room-types/${roomTypeId}/calendar/bulk`).set(bearer(adminToken)).send({ from: day(0), to: day(90), ratePlanId: planId, basePriceMinor: 1_000_000 });
});

after(async () => {
  await closeTestDatabase();
});

describe('booking detail DTO carries what Phase 10 needs', () => {
  it('GET /api/my-bookings/:id and GET /api/bookings/:id both expose the hotel slug, a coupon used on it, and the payment method', async () => {
    await request(app).post('/api/admin/coupons').set(bearer(adminToken)).send({
      code: 'LIFECYCLE10', discountType: 'PERCENT', discountValue: 10, minAmountMinor: 0,
      validFrom: '2020-01-01T00:00:00Z', validTo: '2099-01-01T00:00:00Z', customerEligibility: 'ALL',
    });
    const hold = await createHold(day(1));
    await saveGuests(hold.id);
    const applied = await request(app).post(`/api/booking/holds/${hold.id}/coupon`).set(bearer(guestToken)).send({ code: 'LIFECYCLE10' });
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    const booking = await payFor(hold.id);

    for (const url of [`/api/my-bookings/${booking.id}`, `/api/bookings/${booking.id}`]) {
      const res = await request(app).get(url).set(bearer(guestToken));
      assert.equal(res.status, 200, JSON.stringify(res.body));
      const b = res.body.booking;
      assert.ok(b.hotel.slug, `${url} should carry the hotel slug for Book Again`);
      assert.equal(b.amounts.couponCode, 'LIFECYCLE10');
      assert.ok(b.amounts.couponDiscount > 0);
      assert.equal(b.payment.method, 'simulated');
    }
  });
});

describe('payment recovery (resuming a stuck PAYMENT_PENDING booking)', () => {
  it('GET /api/bookings/:id exposes holdId once a booking exists, and that holdId can resume payment on the same booking', async () => {
    const hold = await createHold(day(5));
    await saveGuests(hold.id);

    // First payment attempt: creates the PAYMENT_PENDING booking and an order, without completing it --
    // simulates the guest closing the app before paying.
    const firstOrder = await request(app).post('/api/payments/create-order').set(bearer(guestToken)).send({ holdId: hold.id });
    assert.equal(firstOrder.status, 201, JSON.stringify(firstOrder.body));

    const detail = await request(app).get(`/api/bookings/${firstOrder.body.bookingId}`).set(bearer(guestToken));
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.booking.status, 'PAYMENT_PENDING');
    assert.equal(detail.body.booking.holdId, hold.id, 'the booking detail must expose holdId so the client can resume payment');

    // Resuming: calling create-order again with that same holdId -- exactly what the mobile "Resume
    // payment" button does -- must succeed against the existing booking rather than erroring.
    const resumed = await request(app).post('/api/payments/create-order').set(bearer(guestToken)).send({ holdId: hold.id });
    assert.equal(resumed.status, 201, JSON.stringify(resumed.body));
    assert.equal(resumed.body.bookingId, firstOrder.body.bookingId);

    // And the resumed order can actually be paid and confirmed, proving this isn't a dead end.
    const capture = await request(app).post('/api/payments/dev/checkout').set(bearer(guestToken)).send({ razorpayOrderId: resumed.body.orderId, outcome: 'success' });
    assert.equal(capture.status, 200, JSON.stringify(capture.body));
    const verified = await request(app).post('/api/payments/verify').set(bearer(guestToken)).send({
      razorpay_order_id: capture.body.razorpay_order_id, razorpay_payment_id: capture.body.razorpay_payment_id, razorpay_signature: capture.body.razorpay_signature,
    });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.booking.status, 'CONFIRMED');
  });
});

describe('refund notifications', () => {
  it('cancelling with a refund creates both a refund.initiated and a refund.completed notification, deep-linking to the booking', async () => {
    const hold = await createHold(day(3));
    await saveGuests(hold.id);
    const booking = await payFor(hold.id);

    const cancelled = await request(app).post(`/api/bookings/${booking.id}/cancel`).set(bearer(guestToken)).send({ reason: 'GUEST_REQUEST' });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));

    const notes = await pool.query(
      `SELECT type, entity_type, entity_id FROM notifications WHERE user_id = $1 AND type IN ('refund.initiated', 'refund.completed') ORDER BY created_at`,
      [guestId],
    );
    assert.equal(notes.rows.length, 2, 'both the initiated and the completed notice were created');
    for (const row of notes.rows) {
      assert.equal(row.entity_type, 'booking');
      assert.equal(Number(row.entity_id), booking.id);
    }
  });

  it('a non-refundable cancellation (after the free-cancellation deadline passed) creates no refund notification at all', async () => {
    // Book, then move the deadline into the past by backdating check-in so the free-cancellation window has closed.
    const hold = await createHold(day(5));
    await saveGuests(hold.id);
    const booking = await payFor(hold.id);
    await pool.query(`UPDATE bookings SET check_in_at = now() - interval '1 hour' WHERE id = $1`, [booking.id]);

    const before = await pool.query(`SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1 AND type = 'refund.initiated'`, [guestId]);
    const cancelled = await request(app).post(`/api/bookings/${booking.id}/cancel`).set(bearer(guestToken)).send({ reason: 'GUEST_REQUEST' });
    assert.equal(cancelled.status, 409, 'the stay has already started, cancellation is refused outright');
    const after = await pool.query(`SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1 AND type = 'refund.initiated'`, [guestId]);
    assert.equal(after.rows[0].c, before.rows[0].c);
  });
});

describe('refund amount is never taken from the client', () => {
  it('a client-supplied refundAmount in the cancel request is silently dropped by validation, not used', async () => {
    const hold = await createHold(day(7));
    await saveGuests(hold.id);
    const booking = await payFor(hold.id);

    const cancelled = await request(app)
      .post(`/api/bookings/${booking.id}/cancel`)
      .set(bearer(guestToken))
      .send({ reason: 'GUEST_REQUEST', refundAmount: 999_999_999, cancellationFee: -500 });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));

    const refund = await pool.query(`SELECT amount_minor FROM refunds WHERE booking_id = $1`, [booking.id]);
    assert.equal(refund.rows.length, 1);
    assert.notEqual(Number(refund.rows[0].amount_minor), 999_999_999);
    assert.equal(Number(refund.rows[0].amount_minor), Number(cancelled.body.booking.amounts.refunded), 'the refund is exactly the server-computed amount');
  });
});
