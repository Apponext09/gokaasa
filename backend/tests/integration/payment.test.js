import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';
import { pool } from '../../src/db/pool.js';
import { addDays } from '../../src/domain/pricing.js';
import { localToday } from '../../src/domain/businessDate.js';
import { createRazorpayGateway } from '../../src/payments/razorpayGateway.js';
import { setGatewayForTests, resetGatewayForTests } from '../../src/payments/index.js';

/**
 * Integration coverage for the payment flow that bookingLifecycle.test.js's `payFor()` helper doesn't
 * reach: it only ever exercises the SIMULATED gateway's dev-checkout bypass (the real signature math is
 * never run). These tests inject the REAL Razorpay REST adapter (createRazorpayGateway) with a fake
 * `fetchImpl`, so the actual HMAC checkout-signature verification, and the server-side amount/currency
 * trust check, run for real against the test database -- no network call ever leaves this process, and no
 * real Razorpay account is touched.
 *
 * There is no webhook: confirmation is entirely backend-authoritative via /verify, which re-fetches the
 * payment from the provider before confirming (see payment.service.js). The "idempotent re-verification"
 * block below covers the recovery case a webhook would otherwise have handled.
 */

const KEY_ID = 'rzp_test_integration';
const KEY_SECRET = 'integration-test-secret';
const PASSWORD = 'Strong-pass-123';
const TODAY = localToday('Asia/Kolkata');
const D0 = addDays(TODAY, 60);

let app;
let hotelId, roomTypeId, planId;
let guestAToken, guestBToken;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const day = (offset) => addDays(D0, offset);

async function loginAs(email) {
  return (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.accessToken;
}

async function createHold(token, checkIn, nights = 2) {
  const res = await request(app).post('/api/booking/holds').set(bearer(token)).send({
    hotelId, roomTypeId, ratePlanId: planId, checkIn, checkOut: addDays(checkIn, nights), rooms: 1,
    occupancy: [{ adults: 2, childAges: [] }],
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.hold;
}

async function saveGuests(token, holdId, email) {
  const res = await request(app).put(`/api/booking/holds/${holdId}/guests`).set(bearer(token)).send({
    primaryContact: { firstName: 'Pay', lastName: 'Test', email, mobile: '+919876500099' },
    rooms: [{ roomIndex: 0, guests: [{ firstName: 'Pay', lastName: 'Test', age: 30 }, { firstName: 'Co', lastName: 'Traveller', age: 28 }] }],
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
}

/** A fake fetchImpl standing in for api.razorpay.com. `onFetchPayment` lets a test control exactly what
 * the "provider" reports for amount/currency/status -- this is how the amount-mismatch test below forces
 * the exact scenario the server must defend against: a captured payment that does not match what was
 * actually charged for. */
function fakeRazorpayFetch({ onFetchPayment } = {}) {
  return async (url, init) => {
    if (url.endsWith('/orders') && init?.method === 'POST') {
      const body = JSON.parse(init.body);
      return { ok: true, json: async () => ({ id: `order_fake_${crypto.randomUUID()}`, amount: body.amount, currency: body.currency }) };
    }
    const paymentMatch = url.match(/\/payments\/([^/]+)$/);
    if (paymentMatch && init?.method === 'GET') {
      const paymentId = decodeURIComponent(paymentMatch[1]);
      return { ok: true, json: async () => onFetchPayment(paymentId) };
    }
    throw new Error(`fakeRazorpayFetch: unexpected call to ${url}`);
  };
}

async function bookingStatus(bookingId) {
  const row = await pool.query('SELECT status FROM bookings WHERE id = $1', [bookingId]);
  return row.rows[0]?.status;
}

before(async () => {
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
  await createUserWithRole({ email: 'payer.a@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  await createUserWithRole({ email: 'payer.b@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  const adminToken = await loginAs('admin@example.com');
  guestAToken = await loginAs('payer.a@example.com');
  guestBToken = await loginAs('payer.b@example.com');

  const created = await request(app).post('/api/admin/hotels').set(bearer(adminToken)).send({ name: 'Payment Test Hotel', city: 'Pune', countryCode: 'IN' });
  hotelId = created.body.hotel.id;
  await request(app).patch(`/api/admin/hotels/${hotelId}`).set(bearer(adminToken)).send({
    description: 'Payment integration test hotel', starRating: 4, addressLine: '1 Payment Road', latitude: 18.5, longitude: 73.8,
  });
  await pool.query(`INSERT INTO hotel_images (hotel_id, category, source_url, is_cover) VALUES ($1, 'EXTERIOR', 'https://example.com/p.jpg', true)`, [hotelId]);
  await request(app).put(`/api/admin/hotels/${hotelId}/amenities`).set(bearer(adminToken)).send({ codes: ['WIFI'] });
  for (const action of ['SUBMIT_FOR_REVIEW', 'MARK_READY', 'PUBLISH']) {
    await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(adminToken)).send({ action });
  }
  const room = await request(app).post(`/api/admin/hotels/${hotelId}/room-types`).set(bearer(adminToken)).send({
    name: 'Payment Test Room', roomCode: 'PAY', category: 'DELUXE', bedType: 'KING', bedCount: 1,
    maxAdults: 2, maxChildren: 1, maxOccupancy: 3, smoking: 'NON_SMOKING', totalUnits: 5,
  });
  roomTypeId = room.body.roomType.id;
  const policies = await request(app).get(`/api/admin/hotels/${hotelId}/cancellation-policies`).set(bearer(adminToken));
  const freePolicy = policies.body.policies.find((p) => p.code === 'FREE_CANCELLATION');
  const plan = await request(app).post(`/api/admin/room-types/${roomTypeId}/rate-plans`).set(bearer(adminToken)).send({
    code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, cancellationPolicyId: freePolicy.id, discountPercent: 0, taxPercent: 10, feeMinor: 0,
  });
  planId = plan.body.ratePlan.id;
  await request(app).post(`/api/admin/room-types/${roomTypeId}/calendar/bulk`).set(bearer(adminToken)).send({ from: day(0), to: day(90), ratePlanId: planId, basePriceMinor: 2_000_000 });
});

after(async () => {
  resetGatewayForTests();
  await closeTestDatabase();
});

beforeEach(() => {
  resetGatewayForTests();
});

describe('order creation: ownership and input validation', () => {
  it('rejects create-order for a hold that belongs to a different guest, as a plain 404 (never leaking that the hold exists)', async () => {
    const hold = await createHold(guestAToken, day(1));
    const res = await request(app).post('/api/payments/create-order').set(bearer(guestBToken)).send({ holdId: hold.id });
    assert.equal(res.status, 404);
  });

  it('rejects create-order for a hold id that does not exist at all', async () => {
    const res = await request(app).post('/api/payments/create-order').set(bearer(guestAToken)).send({ holdId: 999_999_999 });
    assert.equal(res.status, 404);
  });

  it('rejects create-order with no authentication', async () => {
    const hold = await createHold(guestAToken, day(2));
    const res = await request(app).post('/api/payments/create-order').send({ holdId: hold.id });
    assert.equal(res.status, 401);
  });
});

describe('real signature verification (the actual Razorpay HMAC math, not the simulated-gateway bypass)', () => {
  it('a correctly signed checkout response confirms the booking', async () => {
    const hold = await createHold(guestAToken, day(3));
    await saveGuests(guestAToken, hold.id, 'payer.a@example.com');
    setGatewayForTests(createRazorpayGateway({
      keyId: KEY_ID, keySecret: KEY_SECRET,
      fetchImpl: fakeRazorpayFetch({ onFetchPayment: () => ({ id: 'pay_good', order_id: order.body.orderId, status: 'captured', amount: order.body.amount, currency: order.body.currency, method: 'card' }) }),
    }));
    var order = await request(app).post('/api/payments/create-order').set(bearer(guestAToken)).send({ holdId: hold.id });
    assert.equal(order.status, 201, JSON.stringify(order.body));

    const paymentId = 'pay_good';
    const signature = crypto.createHmac('sha256', KEY_SECRET).update(`${order.body.orderId}|${paymentId}`).digest('hex');
    const verified = await request(app).post('/api/payments/verify').set(bearer(guestAToken)).send({
      razorpay_order_id: order.body.orderId, razorpay_payment_id: paymentId, razorpay_signature: signature,
    });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.status, 'CONFIRMED');
    assert.equal(await bookingStatus(verified.body.booking.id), 'CONFIRMED');
  });

  it('a tampered/forged signature is rejected outright, and the booking is never confirmed by it', async () => {
    const hold = await createHold(guestAToken, day(5));
    await saveGuests(guestAToken, hold.id, 'payer.a@example.com');
    setGatewayForTests(createRazorpayGateway({ keyId: KEY_ID, keySecret: KEY_SECRET, fetchImpl: fakeRazorpayFetch({ onFetchPayment: () => ({}) }) }));
    const order = await request(app).post('/api/payments/create-order').set(bearer(guestAToken)).send({ holdId: hold.id });
    assert.equal(order.status, 201);

    const verified = await request(app).post('/api/payments/verify').set(bearer(guestAToken)).send({
      razorpay_order_id: order.body.orderId, razorpay_payment_id: 'pay_forged', razorpay_signature: 'deadbeef'.repeat(8),
    });
    assert.equal(verified.status, 400);
    assert.equal(verified.body.error.code, 'BAD_REQUEST');
    assert.equal(verified.body.error.details.code, 'PAYMENT_SIGNATURE_INVALID');

    const bookingRow = await pool.query('SELECT id, status FROM bookings WHERE id = $1', [order.body.bookingId]);
    assert.equal(bookingRow.rows[0].status, 'PAYMENT_PENDING', 'the booking stays unconfirmed -- a client-supplied payload alone never confirms it');
  });

  it('a correct signature is not enough on its own: an amount reported by the provider that does not match what was actually ordered is rejected, never confirmed', async () => {
    const hold = await createHold(guestAToken, day(7));
    await saveGuests(guestAToken, hold.id, 'payer.a@example.com');
    let orderedAmount;
    setGatewayForTests(createRazorpayGateway({
      keyId: KEY_ID, keySecret: KEY_SECRET,
      // The "provider" reports 1 paise captured, regardless of what was actually ordered -- simulating a
      // compromised/buggy response. The server must catch this itself; it must never trust the client's
      // signature alone as proof the real charged amount matches the booking.
      fetchImpl: fakeRazorpayFetch({ onFetchPayment: (paymentId) => ({ id: paymentId, order_id: currentOrderId, status: 'captured', amount: 1, currency: 'INR', method: 'card' }) }),
    }));
    const order = await request(app).post('/api/payments/create-order').set(bearer(guestAToken)).send({ holdId: hold.id });
    assert.equal(order.status, 201);
    orderedAmount = order.body.amount;
    var currentOrderId = order.body.orderId;

    const paymentId = 'pay_mismatch';
    const signature = crypto.createHmac('sha256', KEY_SECRET).update(`${order.body.orderId}|${paymentId}`).digest('hex');
    const verified = await request(app).post('/api/payments/verify').set(bearer(guestAToken)).send({
      razorpay_order_id: order.body.orderId, razorpay_payment_id: paymentId, razorpay_signature: signature,
    });
    assert.equal(verified.status, 409);
    assert.equal(verified.body.error.details.code, 'PAYMENT_MISMATCH');
    assert.equal(await bookingStatus(order.body.bookingId), 'PAYMENT_PENDING');
    assert.notEqual(orderedAmount, 1, 'sanity check: the real order amount is not trivially 1 paise');
  });
});

describe('recovery without a webhook: re-verification is the only path to CONFIRMED, and it is idempotent', () => {
  it('there is no webhook endpoint: the route no longer exists', async () => {
    const res = await request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').send('{}');
    assert.equal(res.status, 404, 'no webhook route is registered -- payment confirmation has exactly one path: POST /payments/verify');
  });

  it('if the app is closed after a real capture but before verify ran, calling verify again (the existing recovery flow) still confirms the booking -- no gateway event is required', async () => {
    const hold = await createHold(guestAToken, day(9));
    await saveGuests(guestAToken, hold.id, 'payer.a@example.com');
    setGatewayForTests(createRazorpayGateway({ keyId: KEY_ID, keySecret: KEY_SECRET, fetchImpl: fakeRazorpayFetch({ onFetchPayment: () => ({ id: 'pay_recovered', order_id: order.body.orderId, status: 'captured', amount: order.body.amount, currency: order.body.currency, method: 'upi' }) }) }));
    var order = await request(app).post('/api/payments/create-order').set(bearer(guestAToken)).send({ holdId: hold.id });
    assert.equal(order.status, 201);

    const paymentId = 'pay_recovered';
    const signature = crypto.createHmac('sha256', KEY_SECRET).update(`${order.body.orderId}|${paymentId}`).digest('hex');

    // Simulates re-opening the app / retrying Resume Payment after the first verify call never reached the
    // server (closed tab, dropped connection): the exact same signed payload is posted to /verify a second time.
    const first = await request(app).post('/api/payments/verify').set(bearer(guestAToken)).send({
      razorpay_order_id: order.body.orderId, razorpay_payment_id: paymentId, razorpay_signature: signature,
    });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.status, 'CONFIRMED');
    assert.equal(await bookingStatus(order.body.bookingId), 'CONFIRMED');

    const replay = await request(app).post('/api/payments/verify').set(bearer(guestAToken)).send({
      razorpay_order_id: order.body.orderId, razorpay_payment_id: paymentId, razorpay_signature: signature,
    });
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.equal(replay.body.status, 'CONFIRMED', 'a repeat verify call for the same already-settled payment is a no-op, not an error');
    assert.equal(await bookingStatus(order.body.bookingId), 'CONFIRMED', 'still confirmed once, not re-processed');

    const paymentCount = await pool.query('SELECT COUNT(*)::int AS c FROM payments WHERE booking_id = $1 AND status = $2', [order.body.bookingId, 'SUCCESS']);
    assert.equal(paymentCount.rows[0].c, 1, 'exactly one successful payment row, never duplicated by the repeat verify');
  });

  it('verify with a missing/invalid signature can never confirm a booking, even on retry', async () => {
    const hold = await createHold(guestBToken, day(11));
    await saveGuests(guestBToken, hold.id, 'payer.b@example.com');
    setGatewayForTests(createRazorpayGateway({ keyId: KEY_ID, keySecret: KEY_SECRET, fetchImpl: fakeRazorpayFetch({ onFetchPayment: () => ({}) }) }));
    const order = await request(app).post('/api/payments/create-order').set(bearer(guestBToken)).send({ holdId: hold.id });
    assert.equal(order.status, 201);

    for (const signature of ['', 'not-a-real-signature']) {
      const res = await request(app).post('/api/payments/verify').set(bearer(guestBToken)).send({
        razorpay_order_id: order.body.orderId, razorpay_payment_id: 'pay_unverified', razorpay_signature: signature,
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.details.code, 'PAYMENT_SIGNATURE_INVALID');
    }
    assert.equal(await bookingStatus(order.body.bookingId), 'PAYMENT_PENDING', 'never confirmed without a valid signature, no matter how many times it is retried');
  });
});
