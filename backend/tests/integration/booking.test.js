import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';
import { pool } from '../../src/db/pool.js';
import { createRazorpayGateway } from '../../src/payments/razorpayGateway.js';
import { resetGatewayForTests, setGatewayForTests } from '../../src/payments/index.js';
import { processRefund } from '../../src/services/refund.service.js';
import { holdService } from '../../src/services/hold.service.js';
import { addDays } from '../../src/domain/pricing.js';
import { localToday } from '../../src/domain/businessDate.js';

const MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'gokaasa-booking-'));
process.env.MEDIA_DIR = MEDIA_DIR;

const PASSWORD = 'Strong-pass-123';
const KEY_SECRET = 'test_key_secret_never_leaves_server';
const TODAY = localToday('Asia/Kolkata');
// Every stay is in the future, and each test uses its own nights, so tests never share inventory.
const D0 = addDays(TODAY, 30);
const NIGHT_TOTAL = 1_120_000; // ₹10,000 base + 12% tax, no discount or fee

let app;
let fake;
let hotelId;
let roomA;
let roomB;
let roomC;
let planRO;
let planPartial;
let planB;
let planC;
let policies;
let guestToken;
let otherToken;
let adminToken;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const day = (offset) => addDays(D0, offset);

async function loginAs(email) {
  return (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.accessToken;
}

/**
 * A fake Razorpay HTTP client. It answers the same endpoints the real API does, so the production adapter runs
 * unchanged: order creation, payment fetch, refunds. `pay()` plays the customer completing Checkout: Razorpay
 * creates the payment and signs it with the key secret, exactly as the browser would receive it.
 */
function fakeRazorpay() {
  const orders = new Map();
  const payments = new Map();
  const refundCalls = [];
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const fetchImpl = async (url, init = {}) => {
    const { pathname } = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    if (init.method === 'POST' && pathname === '/v1/orders') {
      const id = `order_${crypto.randomBytes(6).toString('hex')}`;
      orders.set(id, { amount: body.amount, currency: body.currency, receipt: body.receipt });
      return json(200, { id, amount: body.amount, currency: body.currency, status: 'created' });
    }
    const match = pathname.match(/^\/v1\/payments\/([^/]+)(\/refund)?$/);
    if (match && !match[2] && init.method === 'GET') {
      const payment = payments.get(match[1]);
      return payment ? json(200, payment) : json(400, { error: { description: 'The id provided does not exist' } });
    }
    if (match && match[2] && init.method === 'POST') {
      refundCalls.push({ paymentId: match[1], amount: body.amount });
      return json(200, { id: `rfnd_${refundCalls.length}`, status: 'processed' });
    }
    return json(404, { error: { description: 'Not found' } });
  };

  const gateway = createRazorpayGateway({
    keyId: 'rzp_test_fakekeyid',
    keySecret: KEY_SECRET,
    fetchImpl,
  });

  const pay = ({ orderId, amount, currency = 'INR', status = 'captured' }) => {
    const paymentId = `pay_${crypto.randomBytes(6).toString('hex')}`;
    const order = orders.get(orderId);
    payments.set(paymentId, {
      id: paymentId,
      order_id: orderId,
      amount: amount ?? order.amount,
      currency,
      status,
      method: 'upi',
      card: { last4: '4242', network: 'Visa' }, // present at the provider; must never reach our database
    });
    const signature = crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
    return { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature, paymentId, amount: payments.get(paymentId).amount };
  };

  return { gateway, orders, payments, refundCalls, pay };
}

/** Guest details that match the occupancy: adults are 30, children get the ages requested. */
function guestDetailsFor(occupancy) {
  return {
    primaryContact: { firstName: 'Asha', lastName: 'Rao', email: 'Guest@Example.com ', mobile: '+91 98765 43210' },
    rooms: occupancy.map((room, roomIndex) => ({
      roomIndex,
      guests: [
        ...Array.from({ length: room.adults }, (_, i) => ({ firstName: `Adult${roomIndex}`, lastName: `No${i}`, age: 30 })),
        ...room.childAges.map((age, i) => ({ firstName: `Child${roomIndex}`, lastName: `No${i}`, age })),
      ],
    })),
    gstNumber: '27AAAPL1234C1ZV',
    companyName: 'Acme Travel',
    specialRequest: 'Late check-in please',
  };
}

async function createHold(token, { roomId, planId, offset, nights = 1, rooms = 1, occupancy } = {}) {
  const checkIn = day(offset);
  const guests = occupancy ?? Array.from({ length: rooms }, () => ({ adults: 2, childAges: [] }));
  return request(app)
    .post('/api/booking/holds')
    .set(bearer(token))
    .send({
      hotelId,
      roomTypeId: roomId ?? roomA,
      ratePlanId: planId ?? planRO,
      checkIn,
      checkOut: addDays(checkIn, nights),
      rooms,
      occupancy: guests,
    });
}

async function holdWithGuests(token, opts = {}) {
  const hold = await createHold(token, opts);
  assert.equal(hold.status, 201, JSON.stringify(hold.body));
  const saved = await request(app)
    .put(`/api/booking/holds/${hold.body.hold.id}/guests`)
    .set(bearer(token))
    .send(guestDetailsFor(hold.body.hold.quote.stay.occupancy));
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  return saved.body.hold;
}

async function startPayment(token, holdId) {
  const res = await request(app).post('/api/payments/create-order').set(bearer(token)).send({ holdId });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

/** Full happy path: hold, guest details, order, customer pays, server verifies. Returns the confirmed booking. */
async function confirmedBooking(token, opts = {}) {
  const hold = await holdWithGuests(token, opts);
  const order = await startPayment(token, hold.id);
  const payment = fake.pay({ orderId: order.orderId, amount: order.amount });
  const verified = await request(app).post('/api/payments/verify').set(bearer(token)).send(payment);
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  return { holdId: hold.id, orderId: order.orderId, payment, booking: verified.body.booking };
}

async function availableRooms(offset, roomId = roomA) {
  const checkIn = day(offset);
  const res = await request(app).get(`/api/hotels/${hotelId}/availability?checkIn=${checkIn}&checkOut=${addDays(checkIn, 1)}`);
  return res.body.roomTypes.find((room) => room.id === roomId).availableRooms;
}

async function reservationTotal(holdId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(quantity), 0)::int AS units, COUNT(*) FILTER (WHERE status = 'HELD')::int AS held,
            COUNT(*) FILTER (WHERE status = 'CONFIRMED')::int AS confirmed, COUNT(*) FILTER (WHERE status = 'RELEASED')::int AS released
       FROM inventory_reservations WHERE hold_id = $1`,
    [holdId],
  );
  return rows[0];
}

/** Moves a hold's expiry into the past. The reservation rows carry the same expiry, so both move together. */
async function forceExpiry(holdId, interval) {
  await pool.query(`UPDATE booking_holds SET expires_at = now() - interval '${interval}' WHERE id = $1`, [holdId]);
  await pool.query(`UPDATE inventory_reservations SET expires_at = now() - interval '${interval}' WHERE hold_id = $1`, [holdId]);
}

async function holdRow(holdId) {
  return (await pool.query(`SELECT status, booking_id, expires_at FROM booking_holds WHERE id = $1`, [holdId])).rows[0];
}

async function bookingRow(id) {
  return (await pool.query(`SELECT status, paid_minor, refunded_minor FROM bookings WHERE id = $1`, [id])).rows[0];
}

async function publishedHotel(name) {
  const created = await request(app).post('/api/admin/hotels').set(bearer(adminToken)).send({ name, city: 'Mumbai', countryCode: 'IN' });
  const id = created.body.hotel.id;
  await request(app)
    .patch(`/api/admin/hotels/${id}`)
    .set(bearer(adminToken))
    .send({ description: 'Booking test hotel', starRating: 4, addressLine: '2 Marine Drive', latitude: 18.94, longitude: 72.82 });
  await pool.query(
    `INSERT INTO hotel_images (hotel_id, category, source_url, is_cover) VALUES ($1, 'EXTERIOR', 'https://example.com/h.jpg', true)`,
    [id],
  );
  await request(app).put(`/api/admin/hotels/${id}/amenities`).set(bearer(adminToken)).send({ codes: ['WIFI'] });
  await request(app).post(`/api/admin/hotels/${id}/status`).set(bearer(adminToken)).send({ action: 'SUBMIT_FOR_REVIEW' });
  await request(app).post(`/api/admin/hotels/${id}/status`).set(bearer(adminToken)).send({ action: 'MARK_READY' });
  const published = await request(app).post(`/api/admin/hotels/${id}/status`).set(bearer(adminToken)).send({ action: 'PUBLISH' });
  assert.equal(published.status, 200, JSON.stringify(published.body));
  return id;
}

async function createRoom(overrides) {
  const res = await request(app)
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
      ...overrides,
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.roomType.id;
}

async function createPlan(roomId, { code, policyCode }) {
  const res = await request(app)
    .post(`/api/admin/room-types/${roomId}/rate-plans`)
    .set(bearer(adminToken))
    .send({
      code,
      name: `${code} rate`,
      mealPlan: 'BREAKFAST',
      isRefundable: true,
      cancellationPolicyId: policies[policyCode].id,
      discountPercent: 0,
      taxPercent: 12,
      feeMinor: 0,
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.ratePlan.id;
}

async function priceNights(roomId, planId, fromOffset, toOffset, basePriceMinor = 1_000_000) {
  const res = await request(app)
    .post(`/api/admin/room-types/${roomId}/calendar/bulk`)
    .set(bearer(adminToken))
    .send({ from: day(fromOffset), to: day(toOffset), ratePlanId: planId, basePriceMinor });
  assert.equal(res.status, 200, JSON.stringify(res.body));
}

before(async () => {
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
  await createUserWithRole({ email: 'guest@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  await createUserWithRole({ email: 'other@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  adminToken = await loginAs('admin@example.com');
  guestToken = await loginAs('guest@example.com');
  otherToken = await loginAs('other@example.com');

  hotelId = await publishedHotel('Harbour Booking Hotel');
  const list = await request(app).get(`/api/admin/hotels/${hotelId}/cancellation-policies`).set(bearer(adminToken));
  policies = Object.fromEntries(list.body.policies.map((policy) => [policy.code, policy]));

  roomA = await createRoom({ name: 'Deluxe Room', roomCode: 'DLX', totalUnits: 4 });
  roomB = await createRoom({ name: 'Concurrency Room', roomCode: 'CON', totalUnits: 3 });
  roomC = await createRoom({ name: 'Limited Room', roomCode: 'LIM', totalUnits: 2 });
  planRO = await createPlan(roomA, { code: 'RO', policyCode: 'FREE_CANCELLATION' });
  planPartial = await createPlan(roomA, { code: 'PARTIAL', policyCode: 'PARTIAL_REFUND' });
  planB = await createPlan(roomB, { code: 'RO', policyCode: 'FREE_CANCELLATION' });
  planC = await createPlan(roomC, { code: 'RO', policyCode: 'FREE_CANCELLATION' });
  for (const [room, plan] of [[roomA, planRO], [roomA, planPartial], [roomB, planB], [roomC, planC]]) {
    await priceNights(room, plan, 0, 90);
  }
  fake = fakeRazorpay();
  setGatewayForTests(fake.gateway);
});

after(async () => {
  resetGatewayForTests();
  await closeTestDatabase();
  rmSync(MEDIA_DIR, { recursive: true, force: true });
});

describe('holds: creation, server-side quote, expiry', () => {
  it('creates a 5-minute hold with a quote the server computed, and the browser cannot change the price', async () => {
    const res = await request(app)
      .post('/api/booking/holds')
      .set(bearer(guestToken))
      .send({
        hotelId,
        roomTypeId: roomA,
        ratePlanId: planRO,
        checkIn: day(1),
        checkOut: day(2),
        rooms: 1,
        occupancy: [{ adults: 2, childAges: [] }],
        totalMinor: 1,
        basePriceMinor: 1,
        status: 'CONFIRMED',
      });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.hold.status, 'HELD');
    assert.equal(res.body.hold.quote.totals.total, NIGHT_TOTAL);
    assert.ok(res.body.hold.secondsRemaining > 4 * 60 && res.body.hold.secondsRemaining <= 5 * 60, 'expiry follows HOLD_DURATION_MINUTES');
    assert.equal((await holdRow(res.body.hold.id)).status, 'HELD');
  });

  it('a hold reduces sellable inventory for each of its nights, and releasing it restores them', async () => {
    const before = await availableRooms(2);
    const hold = await createHold(guestToken, { offset: 2 });
    assert.equal(hold.status, 201);
    assert.equal(await availableRooms(2), before - 1);
    const released = await request(app).post(`/api/booking/holds/${hold.body.hold.id}/release`).set(bearer(guestToken));
    assert.equal(released.status, 200);
    assert.equal(released.body.hold.status, 'RELEASED');
    assert.equal(await availableRooms(2), before);
    assert.equal((await reservationTotal(hold.body.hold.id)).released, 1);
  });

  it('a multi-room hold reserves the exact number of rooms on every night', async () => {
    const hold = await createHold(guestToken, { offset: 4, nights: 2, rooms: 2 });
    assert.equal(hold.status, 201, JSON.stringify(hold.body));
    const totals = await reservationTotal(hold.body.hold.id);
    assert.equal(totals.units, 4, 'two rooms for two nights');
    assert.equal(totals.held, 2, 'one reservation row per night');
    assert.equal(hold.body.hold.quote.stay.rooms, 2);
  });

  it('refuses a request for more rooms than remain, with the exact guest-facing message', async () => {
    const res = await createHold(guestToken, { roomId: roomC, planId: planC, offset: 6, rooms: 3 });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.message, 'Only 2 rooms are available for your selected dates.');
    assert.equal(res.body.error.details.available, 2);
  });

  it('concurrent holds for the last rooms never overbook: exactly the rooms available are granted', async () => {
    const attempts = await Promise.all(Array.from({ length: 6 }, () => createHold(guestToken, { roomId: roomB, planId: planB, offset: 10 })));
    const granted = attempts.filter((r) => r.status === 201).length;
    const refused = attempts.filter((r) => r.status === 409).length;
    assert.equal(granted, 3, 'roomB has 3 units');
    assert.equal(refused, 3);
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS units FROM inventory_reservations
        WHERE room_type_id = $1 AND stay_date = $2 AND status = 'HELD'`,
      [roomB, day(10)],
    );
    assert.equal(rows[0].units, 3);
  });

  it('holds belong to their owner: another customer gets not-found, never the details', async () => {
    const hold = await createHold(guestToken, { offset: 8 });
    const id = hold.body.hold.id;
    assert.equal((await request(app).get(`/api/booking/holds/${id}`).set(bearer(otherToken))).status, 404);
    assert.equal((await request(app).post(`/api/booking/holds/${id}/release`).set(bearer(otherToken))).status, 404);
    assert.equal((await request(app).put(`/api/booking/holds/${id}/guests`).set(bearer(otherToken)).send(guestDetailsFor([{ adults: 2, childAges: [] }]))).status, 404);
    assert.equal((await holdRow(id)).status, 'HELD');
  });

  it('an expired hold is rejected everywhere, and reads never show it as live', async () => {
    const hold = await createHold(guestToken, { offset: 12 });
    const id = hold.body.hold.id;
    await forceExpiry(id, '1 minute');

    const read = await request(app).get(`/api/booking/holds/${id}`).set(bearer(guestToken));
    assert.equal(read.body.hold.status, 'EXPIRED');
    assert.equal((await holdRow(id)).status, 'EXPIRED', 'the read itself finalises the expiry');

    const guests = await request(app).put(`/api/booking/holds/${id}/guests`).set(bearer(guestToken)).send(guestDetailsFor([{ adults: 2, childAges: [] }]));
    assert.equal(guests.status, 409);
    assert.equal(guests.body.error.message, 'Your room hold has expired. Please search again.');

    const pay = await request(app).post('/api/payments/create-order').set(bearer(guestToken)).send({ holdId: id });
    assert.equal(pay.status, 409);
    assert.equal(pay.body.error.details.code, 'HOLD_EXPIRED');
  });

  it('an expired hold frees its rooms even before the worker runs', async () => {
    const before = await availableRooms(14);
    const hold = await createHold(guestToken, { offset: 14 });
    assert.equal(await availableRooms(14), before - 1);
    // Simulate the worker not having run: the row still says HELD, but its time has passed.
    await forceExpiry(hold.body.hold.id, '1 second');
    assert.equal((await holdRow(hold.body.hold.id)).status, 'HELD');
    assert.equal(await availableRooms(14), before, 'availability ignores reservations past their expiry');
  });

  it('the expiry worker writes the final status and releases the rows', async () => {
    const hold = await createHold(guestToken, { offset: 16 });
    await forceExpiry(hold.body.hold.id, '5 minutes');
    const expired = await holdService.expireDueHolds();
    assert.ok(expired >= 1);
    assert.equal((await holdRow(hold.body.hold.id)).status, 'EXPIRED');
    assert.equal((await reservationTotal(hold.body.hold.id)).held, 0);
  });

  it('a double-submitted hold request (same idempotency key) reuses the first hold instead of taking a second room', async () => {
    const checkIn = day(68);
    const body = {
      hotelId, roomTypeId: roomA, ratePlanId: planRO, checkIn, checkOut: addDays(checkIn, 1),
      rooms: 1, occupancy: [{ adults: 2, childAges: [] }], idempotencyKey: 'guest-double-click-68',
    };
    const [first, second] = await Promise.all([
      request(app).post('/api/booking/holds').set(bearer(guestToken)).send(body),
      request(app).post('/api/booking/holds').set(bearer(guestToken)).send(body),
    ]);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(second.status, 201, JSON.stringify(second.body));
    assert.equal(first.body.hold.id, second.body.hold.id, 'both requests resolve to the same hold');
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS units FROM inventory_reservations
        WHERE room_type_id = $1 AND stay_date = $2 AND status = 'HELD'`,
      [roomA, checkIn],
    );
    assert.equal(rows[0].units, 1, 'only one room was actually reserved, not two');

    // A request with no idempotency key at all is completely unaffected: it always gets its own hold.
    const plain = await createHold(guestToken, { offset: 68, roomId: roomA, planId: planRO });
    assert.equal(plain.status, 201);
    assert.notEqual(plain.body.hold.id, first.body.hold.id);
  });
});

describe('guest details and quotes', () => {
  it('accepts fewer named guests than the room holds (Feature 3: additional guests are optional)', async () => {
    const hold = await createHold(guestToken, { offset: 18, rooms: 1, occupancy: [{ adults: 2, childAges: [7] }] });
    const id = hold.body.hold.id;
    // Room capacity is 3 (2 adults + 1 child); naming only 2 of them is now allowed.
    const fewerNamed = await request(app)
      .put(`/api/booking/holds/${id}/guests`)
      .set(bearer(guestToken))
      .send(guestDetailsFor([{ adults: 2, childAges: [] }]));
    assert.equal(fewerNamed.status, 200, JSON.stringify(fewerNamed.body));
  });

  it('still rejects a guest list that exceeds the room\'s actual capacity, and invalid contact details', async () => {
    const hold = await createHold(guestToken, { offset: 19, rooms: 1, occupancy: [{ adults: 2, childAges: [7] }] });
    const id = hold.body.hold.id;
    // Room capacity is 3; naming 4 guests overshoots it regardless of how optional additional guests are.
    const tooMany = await request(app)
      .put(`/api/booking/holds/${id}/guests`)
      .set(bearer(guestToken))
      .send(guestDetailsFor([{ adults: 2, childAges: [7, 9] }]));
    assert.equal(tooMany.status, 422);

    const badEmail = guestDetailsFor([{ adults: 2, childAges: [7] }]);
    badEmail.primaryContact.email = 'not-an-email';
    badEmail.primaryContact.mobile = '12';
    const invalid = await request(app).put(`/api/booking/holds/${id}/guests`).set(bearer(guestToken)).send(badEmail);
    assert.equal(invalid.status, 422);
    assert.ok(invalid.body.error.details.some((issue) => issue.field.startsWith('body.primaryContact')));
  });

  it('the price the guest sees is a snapshot: a later rate change re-prices only after an explicit re-quote', async () => {
    const hold = await createHold(guestToken, { offset: 20 });
    const id = hold.body.hold.id;
    assert.equal(hold.body.hold.quote.totals.total, NIGHT_TOTAL);
    await holdWithGuestsFor(id, [{ adults: 2, childAges: [] }]);

    await priceNights(roomA, planRO, 20, 20, 2_000_000);
    const stillOld = await request(app).get(`/api/booking/holds/${id}`).set(bearer(guestToken));
    assert.equal(stillOld.body.hold.quote.totals.total, NIGHT_TOTAL, 'the held quote does not move on its own');

    const blocked = await request(app).post('/api/payments/create-order').set(bearer(guestToken)).send({ holdId: id });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.details.code, 'PRICE_CHANGED');
    assert.equal(blocked.body.error.details.total, 2_240_000);

    const requoted = await request(app).post(`/api/booking/holds/${id}/requote`).set(bearer(guestToken));
    assert.equal(requoted.status, 200);
    assert.equal(requoted.body.changed, true);
    assert.equal(requoted.body.hold.quote.totals.total, 2_240_000);
    assert.equal((await startPayment(guestToken, id)).amount, 2_240_000);
  });

  it('the booking snapshot keeps the hotel and room names as they were at booking time', async () => {
    const { booking } = await confirmedBooking(guestToken, { offset: 22 });
    assert.equal(booking.hotel.name, 'Harbour Booking Hotel');

    await request(app).patch(`/api/admin/hotels/${hotelId}`).set(bearer(adminToken)).send({ name: 'Renamed Harbour Hotel' });
    await request(app).patch(`/api/admin/room-types/${roomA}`).set(bearer(adminToken)).send({ name: 'Renamed Deluxe' });

    const after = await request(app).get(`/api/bookings/${booking.id}`).set(bearer(guestToken));
    assert.equal(after.body.booking.hotel.name, 'Harbour Booking Hotel', 'the snapshot, not the live hotel');
    assert.equal(after.body.booking.rooms[0].name, 'Deluxe Room');
  });

  it('billing address is saved with the other optional business details', async () => {
    const hold = await createHold(guestToken, { offset: 70 });
    const id = hold.body.hold.id;
    const details = { ...guestDetailsFor([{ adults: 2, childAges: [] }]), billingAddress: '221B Baker Street, Mumbai 400001' };
    const saved = await request(app).put(`/api/booking/holds/${id}/guests`).set(bearer(guestToken)).send(details);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));

    const order = await startPayment(guestToken, id);
    const payment = fake.pay({ orderId: order.orderId, amount: order.amount });
    const verified = await request(app).post('/api/payments/verify').set(bearer(guestToken)).send(payment);
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.booking.billingAddress, '221B Baker Street, Mumbai 400001');
  });

  it('booking references follow the GK-YYYY-NNNNNNN format and are not sequential between bookings', async () => {
    const first = await confirmedBooking(guestToken, { offset: 72 });
    const second = await confirmedBooking(guestToken, { offset: 74 });
    const refPattern = /^GK-\d{4}-\d{6,}$/;
    assert.match(first.booking.bookingRef, refPattern);
    assert.match(second.booking.bookingRef, refPattern);
    const firstNum = Number(first.booking.bookingRef.split('-')[2]);
    const secondNum = Number(second.booking.bookingRef.split('-')[2]);
    assert.notEqual(Math.abs(secondNum - firstNum), 1, 'two consecutive bookings must not have adjacent reference numbers');
  });
});

describe('payments: amounts and signatures', () => {
  it('the Razorpay order amount is the server amount, whatever the browser sends', async () => {
    const hold = await holdWithGuests(guestToken, { offset: 24 });
    const res = await request(app).post('/api/payments/create-order').set(bearer(guestToken)).send({ holdId: hold.id, amount: 1 });
    assert.equal(res.status, 201);
    assert.equal(res.body.amount, NIGHT_TOTAL);
    assert.equal(fake.orders.get(res.body.orderId).amount, NIGHT_TOTAL, 'the order sent to Razorpay carries the server amount');
    assert.equal(res.body.keyId, 'rzp_test_fakekeyid', 'only the public key id is shared');
    assert.equal(JSON.stringify(res.body).includes(KEY_SECRET), false);
  });

  it('a valid signature and a captured payment confirm the booking and convert the hold', async () => {
    const hold = await holdWithGuests(guestToken, { offset: 26, rooms: 2, occupancy: [{ adults: 2, childAges: [] }, { adults: 1, childAges: [5] }] });
    const order = await startPayment(guestToken, hold.id);
    const payment = fake.pay({ orderId: order.orderId, amount: order.amount });
    const res = await request(app).post('/api/payments/verify').set(bearer(guestToken)).send(payment);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, 'CONFIRMED');
    assert.equal(res.body.booking.status, 'CONFIRMED');
    assert.equal(res.body.booking.paymentStatus, 'PAID');
    assert.equal(res.body.booking.amounts.paid, NIGHT_TOTAL * 2);
    assert.equal(res.body.booking.rooms[0].quantity, 2, 'multi-room booking keeps its rooms');
    assert.equal(res.body.booking.guests.length, 4, 'every guest of every room is stored');

    assert.equal((await holdRow(hold.id)).status, 'CONVERTED');
    const reservations = await reservationTotal(hold.id);
    assert.equal(reservations.units, 2, 'the held units now belong to the booking');
    assert.equal(reservations.confirmed, 1, 'one row per night, here one night');
    assert.equal(reservations.held, 0);
  });

  it('a payment cannot be verified with a tampered signature, and nothing changes', async () => {
    const hold = await holdWithGuests(guestToken, { offset: 28 });
    const order = await startPayment(guestToken, hold.id);
    const payment = fake.pay({ orderId: order.orderId, amount: order.amount });
    const tampered = { ...payment, razorpay_signature: payment.razorpay_signature.replace(/.$/, (c) => (c === '0' ? '1' : '0')) };
    const res = await request(app).post('/api/payments/verify').set(bearer(guestToken)).send(tampered);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.details.code, 'PAYMENT_SIGNATURE_INVALID');
    const booking = await pool.query(`SELECT status FROM bookings WHERE hold_id = $1`, [hold.id]);
    assert.equal(booking.rows[0].status, 'PAYMENT_PENDING', 'a bad signature never confirms');
  });

  it('a verify request for someone else’s order is not found', async () => {
    const hold = await holdWithGuests(guestToken, { offset: 30 });
    const order = await startPayment(guestToken, hold.id);
    const payment = fake.pay({ orderId: order.orderId, amount: order.amount });
    const res = await request(app).post('/api/payments/verify').set(bearer(otherToken)).send(payment);
    assert.equal(res.status, 404);
  });

  it('a failed payment never confirms; the hold stays valid and the guest can retry with a new order', async () => {
    const hold = await holdWithGuests(guestToken, { offset: 32 });
    const first = await startPayment(guestToken, hold.id);
    // No gateway event arrives without a webhook: the client itself reports the decline, exactly as a real
    // failed/dismissed Razorpay Checkout would from the browser.
    const reported = await request(app).post('/api/payments/failed').set(bearer(guestToken)).send({ razorpayOrderId: first.orderId, reason: 'Bank declined' });
    assert.equal(reported.status, 200);

    const { rows } = await pool.query(
      `SELECT p.status, b.status AS booking_status FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE p.provider_order_id = $1`,
      [first.orderId],
    );
    assert.equal(rows[0].status, 'FAILED');
    assert.equal(rows[0].booking_status, 'PAYMENT_PENDING');
    assert.equal((await holdRow(hold.id)).status, 'HELD');

    const retry = await startPayment(guestToken, hold.id);
    assert.notEqual(retry.orderId, first.orderId, 'a retry is a new Razorpay order');
    const attempts = await pool.query(`SELECT COUNT(*)::int AS n FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE b.hold_id = $1`, [hold.id]);
    assert.equal(attempts.rows[0].n, 2);
  });

  it('a payment dismissed on the client keeps the hold for a retry', async () => {
    const hold = await holdWithGuests(guestToken, { offset: 34 });
    const order = await startPayment(guestToken, hold.id);
    const res = await request(app).post('/api/payments/failed').set(bearer(guestToken)).send({ razorpayOrderId: order.orderId, reason: 'Closed' });
    assert.equal(res.status, 200);
    assert.equal(res.body.canRetry, true);
    assert.equal((await holdRow(hold.id)).status, 'HELD');
  });

  it('a second successful payment for a confirmed booking is refunded, never kept', async () => {
    const { orderId, booking } = await confirmedBooking(guestToken, { offset: 36 });
    const refundsBefore = fake.refundCalls.length;
    const second = fake.pay({ orderId, amount: NIGHT_TOTAL });
    const res = await request(app).post('/api/payments/verify').set(bearer(guestToken)).send(second);
    assert.equal(res.status, 200);
    assert.equal(res.body.booking.id, booking.id);
    assert.equal(fake.refundCalls.length, refundsBefore + 1, 'the duplicate was sent back');
    assert.equal(fake.refundCalls.at(-1).paymentId, second.paymentId);
    const successes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM payments WHERE booking_id = $1 AND status IN ('SUCCESS', 'REFUNDED')`,
      [booking.id],
    );
    assert.equal(successes.rows[0].n, 1);
  });

  it('an already-confirmed booking cannot start another payment', async () => {
    const { holdId } = await confirmedBooking(guestToken, { offset: 38 });
    const res = await request(app).post('/api/payments/create-order').set(bearer(guestToken)).send({ holdId });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.details.code, 'ALREADY_PAID');
  });

  it('without a webhook, a repeat /verify call for the same already-settled payment is idempotent: confirmed once, not reprocessed', async () => {
    const hold = await holdWithGuests(guestToken, { offset: 40 });
    const order = await startPayment(guestToken, hold.id);
    const payment = fake.pay({ orderId: order.orderId, amount: order.amount });

    // First verify call settles the payment -- this is the only path to CONFIRMED now that there is no webhook.
    const first = await request(app).post('/api/payments/verify').set(bearer(guestToken)).send(payment);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.status, 'CONFIRMED');

    // Simulates the guest's app retrying verify after the first response was lost (closed tab, dropped
    // connection) -- the existing recovery path, with no gateway event involved.
    const second = await request(app).post('/api/payments/verify').set(bearer(guestToken)).send(payment);
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(second.body.status, 'CONFIRMED', 'a repeat verify for an already-confirmed payment is a no-op, not an error');

    const booking = await pool.query(`SELECT status FROM bookings WHERE hold_id = $1`, [hold.id]);
    assert.equal(booking.rows[0].status, 'CONFIRMED');
    const payments = await pool.query(`SELECT COUNT(*)::int AS n FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE b.hold_id = $1 AND p.status = 'SUCCESS'`, [hold.id]);
    assert.equal(payments.rows[0].n, 1, 'exactly one successful payment row, never duplicated by the repeat verify');
    assert.equal((await holdRow(hold.id)).status, 'CONVERTED');
  });

  it('the public payment config carries the key id only, never a secret', async () => {
    const res = await request(app).get('/api/payments/config');
    assert.equal(res.status, 200);
    assert.equal(res.body.keyId, 'rzp_test_fakekeyid');
    const text = JSON.stringify(res.body);
    assert.equal(text.includes(KEY_SECRET), false);
  });

  it('a payment captured after the hold has expired is refunded, and the booking is not confirmed', async () => {
    const hold = await holdWithGuests(guestToken, { offset: 46 });
    const order = await startPayment(guestToken, hold.id);
    await forceExpiry(hold.id, '1 minute');
    const payment = fake.pay({ orderId: order.orderId, amount: order.amount });
    const refundsBefore = fake.refundCalls.length;

    const res = await request(app).post('/api/payments/verify').set(bearer(guestToken)).send(payment);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.details.code, 'HOLD_EXPIRED_REFUNDED');
    assert.equal(fake.refundCalls.length, refundsBefore + 1);

    const booking = await pool.query(`SELECT id, status, refunded_minor FROM bookings WHERE hold_id = $1`, [hold.id]);
    assert.equal(booking.rows[0].status, 'REFUNDED');
    assert.equal(Number(booking.rows[0].refunded_minor), NIGHT_TOTAL);
    assert.equal((await holdRow(hold.id)).status, 'EXPIRED');
  });

  it('an expired hold cannot be paid, even with a previously created order', async () => {
    const hold = await holdWithGuests(guestToken, { offset: 48 });
    await forceExpiry(hold.id, '1 minute');
    const res = await request(app).post('/api/payments/create-order').set(bearer(guestToken)).send({ holdId: hold.id });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.message, 'Your room hold has expired. Please search again.');
  });
});

describe('bookings: ownership, My Trips, cancellation and refunds', () => {
  it('a customer sees only their own bookings in My Trips and by id', async () => {
    const { booking } = await confirmedBooking(guestToken, { offset: 50 });
    const mine = await request(app).get('/api/my-bookings?tab=upcoming').set(bearer(guestToken));
    assert.ok(mine.body.items.some((item) => item.id === booking.id));
    const theirs = await request(app).get('/api/my-bookings?tab=upcoming').set(bearer(otherToken));
    assert.equal(theirs.body.items.some((item) => item.id === booking.id), false);
    assert.equal((await request(app).get(`/api/bookings/${booking.id}`).set(bearer(otherToken))).status, 404);
    assert.equal((await request(app).get(`/api/my-bookings/${booking.id}`).set(bearer(otherToken))).status, 404);
  });

  it('My Trips details come from the snapshot and show the policy the booking was made under', async () => {
    const { booking } = await confirmedBooking(guestToken, { offset: 52, nights: 2 });
    const res = await request(app).get(`/api/my-bookings/${booking.id}`).set(bearer(guestToken));
    assert.equal(res.status, 200);
    assert.equal(res.body.booking.stay.nights, 2);
    assert.equal(res.body.booking.cancellation.policyName, 'Free cancellation');
    assert.equal(res.body.booking.primaryContact.email, 'guest@example.com', 'contact email is normalised');
    assert.equal(JSON.stringify(res.body).includes('card'), false, 'no card data is stored or returned');
  });

  it('cancellation uses the snapshotted policy: a later edit to the policy does not change the refund', async () => {
    const { booking } = await confirmedBooking(guestToken, { offset: 54, planId: planPartial, occupancy: undefined });
    const edited = await request(app)
      .patch(`/api/admin/cancellation-policies/${policies.PARTIAL_REFUND.id}`)
      .set(bearer(adminToken))
      .send({ name: 'Partial refund', description: 'Edited', isNonRefundable: false, cancellationDeadlineHours: 48, refundPercent: 20 });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));

    const preview = await request(app).get(`/api/bookings/${booking.id}/cancellation-preview`).set(bearer(guestToken));
    assert.equal(preview.body.preview.refundPercent, 50, 'the booking keeps the 50% it was sold with');
    assert.equal(preview.body.preview.refundMinor, NIGHT_TOTAL / 2);
    await request(app)
      .patch(`/api/admin/cancellation-policies/${policies.PARTIAL_REFUND.id}`)
      .set(bearer(adminToken))
      .send({ name: 'Partial refund', description: 'Restored', isNonRefundable: false, cancellationDeadlineHours: 48, refundPercent: 50 });
  });

  it('cancelling refunds the computed amount, releases the rooms and moves the booking to REFUNDED', async () => {
    const { booking } = await confirmedBooking(guestToken, { offset: 56, planId: planPartial });
    const before = await availableRooms(56);
    const refundsBefore = fake.refundCalls.length;
    const res = await request(app).post(`/api/bookings/${booking.id}/cancel`).set(bearer(guestToken)).send({ reason: 'Plans changed' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.booking.status, 'REFUNDED');
    assert.equal(res.body.booking.amounts.refunded, NIGHT_TOTAL / 2);
    assert.equal(fake.refundCalls.length, refundsBefore + 1);
    assert.equal(fake.refundCalls.at(-1).amount, NIGHT_TOTAL / 2);
    assert.equal(await availableRooms(56), before + 1, 'cancelled rooms go back on sale');
  });

  it('cancelling twice is idempotent: the second call changes nothing and refunds nothing', async () => {
    const { booking } = await confirmedBooking(guestToken, { offset: 58 });
    const first = await request(app).post(`/api/bookings/${booking.id}/cancel`).set(bearer(guestToken)).send({});
    assert.equal(first.status, 200);
    const refunds = fake.refundCalls.length;
    const second = await request(app).post(`/api/bookings/${booking.id}/cancel`).set(bearer(guestToken)).send({});
    assert.equal(second.status, 200);
    assert.equal(second.body.booking.status, first.body.booking.status);
    assert.equal(fake.refundCalls.length, refunds);
    const refundRows = await pool.query(`SELECT COUNT(*)::int AS n FROM refunds WHERE booking_id = $1`, [booking.id]);
    assert.equal(refundRows.rows[0].n, 1);
  });

  it('a completed refund is never sent to the gateway again', async () => {
    const { booking } = await confirmedBooking(guestToken, { offset: 60 });
    await request(app).post(`/api/bookings/${booking.id}/cancel`).set(bearer(guestToken)).send({});
    const refund = await pool.query(`SELECT id FROM refunds WHERE booking_id = $1`, [booking.id]);
    const calls = fake.refundCalls.length;
    assert.equal(await processRefund(refund.rows[0].id), 'SUCCESS');
    assert.equal(fake.refundCalls.length, calls, 'no second money movement');
  });

  it('a released hold can no longer be paid', async () => {
    const hold = await holdWithGuests(guestToken, { offset: 62 });
    const released = await request(app).post(`/api/booking/holds/${hold.id}/release`).set(bearer(guestToken));
    assert.equal(released.body.hold.status, 'RELEASED');
    const pay = await request(app).post('/api/payments/create-order').set(bearer(guestToken)).send({ holdId: hold.id });
    assert.equal(pay.status, 409);
  });

  it('guest details are locked once payment has started', async () => {
    const hold = await holdWithGuests(guestToken, { offset: 64 });
    await startPayment(guestToken, hold.id);
    const res = await request(app)
      .put(`/api/booking/holds/${hold.id}/guests`)
      .set(bearer(guestToken))
      .send(guestDetailsFor([{ adults: 2, childAges: [] }]));
    assert.equal(res.status, 409);
  });

  it('a payment can be read by id, scoped to its owner', async () => {
    const { booking, payment } = await confirmedBooking(guestToken, { offset: 76 });
    const row = await pool.query(`SELECT id FROM payments WHERE provider_order_id = $1`, [payment.razorpay_order_id]);
    const paymentId = row.rows[0].id;

    const mine = await request(app).get(`/api/payments/${paymentId}`).set(bearer(guestToken));
    assert.equal(mine.status, 200, JSON.stringify(mine.body));
    assert.equal(mine.body.bookingId, booking.id);
    assert.equal(mine.body.status, 'SUCCESS');

    const theirs = await request(app).get(`/api/payments/${paymentId}`).set(bearer(otherToken));
    assert.equal(theirs.status, 404);
  });

  it('a refund can be read by id, scoped to its owner', async () => {
    const { booking } = await confirmedBooking(guestToken, { offset: 78, planId: planPartial });
    const cancelled = await request(app).post(`/api/bookings/${booking.id}/cancel`).set(bearer(guestToken)).send({ reason: 'Plans changed' });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    const refundRow = await pool.query(`SELECT id FROM refunds WHERE booking_id = $1`, [booking.id]);
    const refundId = refundRow.rows[0].id;

    const mine = await request(app).get(`/api/refunds/${refundId}`).set(bearer(guestToken));
    assert.equal(mine.status, 200, JSON.stringify(mine.body));
    assert.equal(mine.body.bookingId, booking.id);

    const theirs = await request(app).get(`/api/refunds/${refundId}`).set(bearer(otherToken));
    assert.equal(theirs.status, 404);
  });

  it('hold creation and release are recorded in the audit log', async () => {
    const hold = await createHold(guestToken, { offset: 80 });
    const id = hold.body.hold.id;
    await request(app).post(`/api/booking/holds/${id}/release`).set(bearer(guestToken));

    const rows = await pool.query(`SELECT action FROM audit_logs WHERE entity = 'booking_hold' AND entity_id = $1 ORDER BY id`, [String(id)]);
    assert.deepEqual(rows.rows.map((r) => r.action), ['booking_hold.created', 'booking_hold.released']);
  });
});

describe('payment mode (simulated gateway, development only)', () => {
  it('a simulated checkout confirms through the same server-side verification as Razorpay', async () => {
    resetGatewayForTests();
    const { getGateway } = await import('../../src/payments/index.js');
    assert.equal(getGateway().simulated, true, 'no Razorpay keys are configured in tests');
    try {
      const hold = await holdWithGuests(guestToken, { offset: 66 });
      const order = await startPayment(guestToken, hold.id);
      assert.equal(order.simulated, true);
      const checkout = await request(app).post('/api/payments/dev/checkout').set(bearer(guestToken)).send({ razorpayOrderId: order.orderId, outcome: 'success' });
      assert.equal(checkout.status, 200);
      const verified = await request(app).post('/api/payments/verify').set(bearer(guestToken)).send(checkout.body);
      assert.equal(verified.status, 200, JSON.stringify(verified.body));
      assert.equal(verified.body.booking.status, 'CONFIRMED');
    } finally {
      setGatewayForTests(fake.gateway);
    }
  });
});

async function holdWithGuestsFor(holdId, occupancy) {
  const res = await request(app).put(`/api/booking/holds/${holdId}/guests`).set(bearer(guestToken)).send(guestDetailsFor(occupancy));
  assert.equal(res.status, 200, JSON.stringify(res.body));
}

async function bookingIdOf(holdId) {
  return (await pool.query(`SELECT id FROM bookings WHERE hold_id = $1`, [holdId])).rows[0].id;
}
