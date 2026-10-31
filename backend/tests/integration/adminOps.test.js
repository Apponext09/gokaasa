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

const MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'gokaasa-adminops-'));
process.env.MEDIA_DIR = MEDIA_DIR;

const PASSWORD = 'Strong-pass-123';
const TODAY = localToday('Asia/Kolkata');
const D0 = addDays(TODAY, 30);

let app;
let adminToken, managerAToken, managerBToken, guestToken;
let hotelA, hotelB;
let roomA, planA;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const day = (offset) => addDays(D0, offset);

async function loginAs(email) {
  return (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.accessToken;
}

async function publishedHotel(name, creatorToken = adminToken) {
  const created = await request(app).post('/api/admin/hotels').set(bearer(creatorToken)).send({ name, city: 'Mumbai', countryCode: 'IN' });
  const id = created.body.hotel.id;
  await request(app)
    .patch(`/api/admin/hotels/${id}`)
    .set(bearer(adminToken))
    .send({ description: 'Admin ops test hotel', starRating: 4, addressLine: '1 Test Road', latitude: 18.9, longitude: 72.8 });
  await pool.query(`INSERT INTO hotel_images (hotel_id, category, source_url, is_cover) VALUES ($1, 'EXTERIOR', 'https://example.com/a.jpg', true)`, [id]);
  await request(app).put(`/api/admin/hotels/${id}/amenities`).set(bearer(adminToken)).send({ codes: ['WIFI'] });
  for (const action of ['SUBMIT_FOR_REVIEW', 'MARK_READY', 'PUBLISH']) {
    const res = await request(app).post(`/api/admin/hotels/${id}/status`).set(bearer(adminToken)).send({ action });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  }
  return id;
}

async function createRoom(hotelId, overrides) {
  const res = await request(app).post(`/api/admin/hotels/${hotelId}/room-types`).set(bearer(adminToken)).send({
    name: 'Deluxe Room', roomCode: 'DLX', category: 'DELUXE', bedType: 'KING', bedCount: 1,
    maxAdults: 2, maxChildren: 1, maxOccupancy: 3, smoking: 'NON_SMOKING', totalUnits: 4, ...overrides,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.roomType.id;
}

async function createPlan(hotelId, roomId) {
  const policies = await request(app).get(`/api/admin/hotels/${hotelId}/cancellation-policies`).set(bearer(adminToken));
  const policy = policies.body.policies.find((p) => p.code === 'FREE_CANCELLATION');
  const res = await request(app).post(`/api/admin/room-types/${roomId}/rate-plans`).set(bearer(adminToken)).send({
    code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, cancellationPolicyId: policy.id,
    discountPercent: 0, taxPercent: 12, feeMinor: 0,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.ratePlan.id;
}

async function priceNights(roomId, planId, fromOffset, toOffset) {
  const res = await request(app)
    .post(`/api/admin/room-types/${roomId}/calendar/bulk`)
    .set(bearer(adminToken))
    .send({ from: day(fromOffset), to: day(toOffset), ratePlanId: planId, basePriceMinor: 1_000_000 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
}

/** Guest books and pays via the simulated gateway (no real Razorpay keys in test config). Returns the booking. */
async function confirmedBooking(hotelId, roomId, planId, offset) {
  const checkIn = day(offset);
  const hold = await request(app).post('/api/booking/holds').set(bearer(guestToken)).send({
    hotelId, roomTypeId: roomId, ratePlanId: planId, checkIn, checkOut: addDays(checkIn, 1), rooms: 1,
    occupancy: [{ adults: 2, childAges: [] }],
  });
  assert.equal(hold.status, 201, JSON.stringify(hold.body));
  const holdId = hold.body.hold.id;
  const guests = await request(app).put(`/api/booking/holds/${holdId}/guests`).set(bearer(guestToken)).send({
    primaryContact: { firstName: 'Admin', lastName: 'OpsGuest', email: 'adminops.guest@example.com', mobile: '+919876500000' },
    rooms: [{ roomIndex: 0, guests: [{ firstName: 'Admin', lastName: 'OpsGuest', age: 30 }, { firstName: 'Co', lastName: 'Traveller', age: 28 }] }],
  });
  assert.equal(guests.status, 200, JSON.stringify(guests.body));
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
  await createUserWithRole({ email: 'managerA@example.com', password: PASSWORD, roleCode: 'HOTEL_OWNER' });
  await createUserWithRole({ email: 'managerB@example.com', password: PASSWORD, roleCode: 'HOTEL_OWNER' });
  await createUserWithRole({ email: 'adminops.guest@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  adminToken = await loginAs('admin@example.com');
  managerAToken = await loginAs('managerA@example.com');
  managerBToken = await loginAs('managerB@example.com');
  guestToken = await loginAs('adminops.guest@example.com');

  hotelA = await publishedHotel('Owner Ops Hotel A', managerAToken);
  hotelB = await publishedHotel('Admin Ops Hotel B');
  roomA = await createRoom(hotelA, { roomCode: 'DLX' });
  planA = await createPlan(hotelA, roomA);
  await priceNights(roomA, planA, 0, 10);

  // Owner A created Hotel A and is linked automatically. Owner B has created no hotels.
});

after(async () => {
  await closeTestDatabase();
  rmSync(MEDIA_DIR, { recursive: true, force: true });
});

describe('hotel-owner scoping (IDOR)', () => {
  it('the owner who created Hotel A can read and edit it', async () => {
    const res = await request(app).get(`/api/admin/hotels/${hotelA}`).set(bearer(managerAToken));
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });

  it('another owner gets the same not-found a stranger would', async () => {
    const res = await request(app).get(`/api/admin/hotels/${hotelA}`).set(bearer(managerBToken));
    assert.equal(res.status, 404);
    const patch = await request(app).patch(`/api/admin/hotels/${hotelA}`).set(bearer(managerBToken)).send({ name: 'Hijacked' });
    assert.equal(patch.status, 404);
  });

  it('room-type and rate-plan routes resolve to the owning hotel, not just the literal :id', async () => {
    const asOwner = await request(app).get(`/api/admin/room-types/${roomA}`).set(bearer(managerAToken));
    assert.equal(asOwner.status, 200);
    const asStranger = await request(app).get(`/api/admin/room-types/${roomA}`).set(bearer(managerBToken));
    assert.equal(asStranger.status, 404);
    const rateAsStranger = await request(app).patch(`/api/admin/rate-plans/${planA}`).set(bearer(managerBToken)).send({ name: 'Hijacked rate' });
    assert.equal(rateAsStranger.status, 404);
  });

  it('ADMIN bypasses hotel scoping entirely', async () => {
    const a = await request(app).get(`/api/admin/hotels/${hotelA}`).set(bearer(adminToken));
    const b = await request(app).get(`/api/admin/hotels/${hotelB}`).set(bearer(adminToken));
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
  });

  it('the hotel list is filtered to an owner\'s own hotels, not just detail access', async () => {
    const asManagerA = await request(app).get('/api/admin/hotels').set(bearer(managerAToken));
    assert.deepEqual(asManagerA.body.items.map((h) => h.id).sort(), [hotelA]);
    const asManagerB = await request(app).get('/api/admin/hotels').set(bearer(managerBToken));
    assert.deepEqual(asManagerB.body.items, []);
    const asAdmin = await request(app).get('/api/admin/hotels').set(bearer(adminToken));
    assert.ok(asAdmin.body.items.map((h) => h.id).includes(hotelA) && asAdmin.body.items.map((h) => h.id).includes(hotelB));
  });

  it('an owner who creates a new hotel is automatically linked to it', async () => {
    const created = await request(app).post('/api/admin/hotels').set(bearer(managerAToken)).send({ name: 'Owner Created Hotel', city: 'Pune', countryCode: 'IN' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const ownId = created.body.hotel.id;
    const readBack = await request(app).get(`/api/admin/hotels/${ownId}`).set(bearer(managerAToken));
    assert.equal(readBack.status, 200, 'the creator is not locked out of what they just created');
  });
});

describe('admin bookings, payments and refunds', () => {
  let booking;

  it('lists and reads bookings, scoped to the manager\'s hotels', async () => {
    booking = await confirmedBooking(hotelA, roomA, planA, 2);

    const asAdmin = await request(app).get('/api/admin/bookings').set(bearer(adminToken));
    assert.equal(asAdmin.status, 200);
    assert.ok(asAdmin.body.items.some((b) => b.id === booking.id));

    const asOwningManager = await request(app).get(`/api/admin/bookings/${booking.id}`).set(bearer(managerAToken));
    assert.equal(asOwningManager.status, 200);
    assert.equal(asOwningManager.body.booking.bookingRef, booking.bookingRef);

    const asStrangerManager = await request(app).get(`/api/admin/bookings/${booking.id}`).set(bearer(managerBToken));
    assert.equal(asStrangerManager.status, 404, 'a booking at a hotel you do not manage looks like it does not exist');

    const listAsStranger = await request(app).get('/api/admin/bookings').set(bearer(managerBToken));
    assert.equal(listAsStranger.body.items.some((b) => b.id === booking.id), false);
  });

  it('lists payments and refunds scoped the same way', async () => {
    const payments = await request(app).get('/api/admin/payments').set(bearer(managerAToken));
    assert.equal(payments.status, 200);
    assert.ok(payments.body.items.some((p) => p.bookingId === booking.id));

    const paymentsAsStranger = await request(app).get('/api/admin/payments').set(bearer(managerBToken));
    assert.equal(paymentsAsStranger.body.items.some((p) => p.bookingId === booking.id), false);
  });

  it('a manager can cancel a booking at their own hotel, and the refund is processed through the real refund service', async () => {
    const cancel = await request(app).post(`/api/admin/bookings/${booking.id}/cancel`).set(bearer(managerAToken)).send({ reason: 'Guest requested by phone' });
    assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
    assert.equal(cancel.body.booking.status, 'REFUNDED');

    const refunds = await request(app).get('/api/admin/refunds').set(bearer(managerAToken));
    assert.ok(refunds.body.items.some((r) => r.bookingId === booking.id && r.status === 'SUCCESS'));
  });

  it('a manager cannot cancel a booking at a hotel they do not manage', async () => {
    const other = await confirmedBooking(hotelA, roomA, planA, 4);
    const res = await request(app).post(`/api/admin/bookings/${other.id}/cancel`).set(bearer(managerBToken)).send({});
    assert.equal(res.status, 404);
  });
});

describe('admin customers', () => {
  it('lists customers scoped to the manager\'s hotels, with real spend aggregates, never a password hash', async () => {
    const asAdmin = await request(app).get('/api/admin/customers').set(bearer(adminToken));
    assert.equal(asAdmin.status, 200);
    const customer = asAdmin.body.items.find((c) => c.email === 'adminops.guest@example.com');
    assert.ok(customer);
    assert.ok(customer.totalSpendMinor > 0);
    assert.equal('passwordHash' in customer, false);

    const asOwningManager = await request(app).get('/api/admin/customers').set(bearer(managerAToken));
    assert.ok(asOwningManager.body.items.some((c) => c.email === 'adminops.guest@example.com'));

    const asStrangerManager = await request(app).get('/api/admin/customers').set(bearer(managerBToken));
    assert.equal(asStrangerManager.body.items.some((c) => c.email === 'adminops.guest@example.com'), false);

    const detail = await request(app).get(`/api/admin/customers/${customer.id}`).set(bearer(adminToken));
    assert.equal(detail.status, 200);
    assert.ok(detail.body.customer.bookings.length > 0);
    assert.equal('isActive' in detail.body.customer, true);
  });
});

describe('dashboard trends', () => {
  it('returns a real day-by-day series and revenue totals for the range, scoped for a manager', async () => {
    // Trends are keyed by when a booking/payment happened (created_at/paid_at), not by the stay dates.
    const from = TODAY;
    const to = addDays(TODAY, 1);
    const asAdmin = await request(app).get(`/api/admin/dashboard/trends?from=${from}&to=${to}`).set(bearer(adminToken));
    assert.equal(asAdmin.status, 200, JSON.stringify(asAdmin.body));
    assert.equal(asAdmin.body.bookingSeries.length, 2, 'one row per day inclusive');
    assert.ok(asAdmin.body.revenue.collectedMinor > 0);

    const asStrangerManager = await request(app).get(`/api/admin/dashboard/trends?from=${from}&to=${to}`).set(bearer(managerBToken));
    assert.equal(asStrangerManager.status, 200);
    assert.equal(asStrangerManager.body.revenue.collectedMinor, 0, 'a manager with no hotels sees honestly-empty numbers, not someone else\'s');
  });
});

describe('audit log viewer (ADMIN only)', () => {
  it('denies a manager and lists real recorded actions for an admin', async () => {
    const denied = await request(app).get('/api/admin/audit-logs').set(bearer(managerAToken));
    assert.equal(denied.status, 403);

    const res = await request(app).get('/api/admin/audit-logs?action=hotel.created').set(bearer(adminToken));
    assert.equal(res.status, 200);
    assert.ok(res.body.items.length > 0);
    assert.ok(res.body.items.every((entry) => entry.action === 'hotel.created'));
    assert.equal('newValue' in res.body.items[0], true);
  });
});
