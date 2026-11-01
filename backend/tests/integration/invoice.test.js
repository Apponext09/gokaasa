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

const MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'gokaasa-invoice-'));
process.env.MEDIA_DIR = MEDIA_DIR;

const PASSWORD = 'Strong-pass-123';
const TODAY = localToday('Asia/Kolkata');
const D0 = addDays(TODAY, 30);

let app;
let adminToken, managerAToken, managerBToken, guestToken, otherToken;
let hotelA, hotelB, roomA, planA, planPartialA;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const day = (offset) => addDays(D0, offset);

async function loginAs(email) {
  return (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.accessToken;
}

async function publishedHotel(name) {
  const created = await request(app).post('/api/admin/hotels').set(bearer(adminToken)).send({ name, city: 'Mumbai', countryCode: 'IN' });
  const id = created.body.hotel.id;
  await request(app)
    .patch(`/api/admin/hotels/${id}`)
    .set(bearer(adminToken))
    .send({ description: 'Invoice test hotel', starRating: 4, addressLine: '1 Invoice Road', latitude: 18.9, longitude: 72.8 });
  await pool.query(`INSERT INTO hotel_images (hotel_id, category, source_url, is_cover) VALUES ($1, 'EXTERIOR', 'https://example.com/i.jpg', true)`, [id]);
  await request(app).put(`/api/admin/hotels/${id}/amenities`).set(bearer(adminToken)).send({ codes: ['WIFI'] });
  for (const action of ['SUBMIT_FOR_REVIEW', 'MARK_READY', 'PUBLISH']) {
    const res = await request(app).post(`/api/admin/hotels/${id}/status`).set(bearer(adminToken)).send({ action });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  }
  return id;
}

async function confirmedBooking(token, { offset, planId = planA, gstNumber, companyName, billingAddress } = {}) {
  const checkIn = day(offset);
  const hold = await request(app).post('/api/booking/holds').set(bearer(token)).send({
    hotelId: hotelA, roomTypeId: roomA, ratePlanId: planId, checkIn, checkOut: addDays(checkIn, 1), rooms: 1,
    occupancy: [{ adults: 2, childAges: [] }],
  });
  assert.equal(hold.status, 201, JSON.stringify(hold.body));
  const holdId = hold.body.hold.id;
  const guests = await request(app).put(`/api/booking/holds/${holdId}/guests`).set(bearer(token)).send({
    primaryContact: { firstName: 'Invoice', lastName: 'Guest', email: 'invoice.guest@example.com', mobile: '+919876500003' },
    rooms: [{ roomIndex: 0, guests: [{ firstName: 'Invoice', lastName: 'Guest', age: 30 }, { firstName: 'Co', lastName: 'Traveller', age: 28 }] }],
    gstNumber, companyName, billingAddress,
  });
  assert.equal(guests.status, 200, JSON.stringify(guests.body));
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

function assertRealPdf(res) {
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.headers['content-type'], 'application/pdf');
  assert.match(res.headers['content-disposition'], /^attachment; filename="GK-\d{4}-\d+-invoice\.pdf"$/);
  const buffer = Buffer.from(res.body);
  assert.ok(buffer.length > 500, `PDF should be a real, non-trivial document, got ${buffer.length} bytes`);
  assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-', 'response must be an actual PDF, not an error page or empty body');
}

before(async () => {
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
  await createUserWithRole({ email: 'managerA@example.com', password: PASSWORD, roleCode: 'HOTEL_OWNER' });
  await createUserWithRole({ email: 'managerB@example.com', password: PASSWORD, roleCode: 'HOTEL_OWNER' });
  await createUserWithRole({ email: 'invoice.guest@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  await createUserWithRole({ email: 'invoice.other@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  adminToken = await loginAs('admin@example.com');
  managerAToken = await loginAs('managerA@example.com');
  managerBToken = await loginAs('managerB@example.com');
  guestToken = await loginAs('invoice.guest@example.com');
  otherToken = await loginAs('invoice.other@example.com');

  hotelA = await publishedHotel('Invoice Test Hotel A');
  hotelB = await publishedHotel('Invoice Test Hotel B');
  const room = await request(app).post(`/api/admin/hotels/${hotelA}/room-types`).set(bearer(adminToken)).send({
    name: 'Deluxe Room', roomCode: 'DLX', category: 'DELUXE', bedType: 'KING', bedCount: 1,
    maxAdults: 2, maxChildren: 1, maxOccupancy: 3, smoking: 'NON_SMOKING', totalUnits: 4,
  });
  roomA = room.body.roomType.id;
  const policies = await request(app).get(`/api/admin/hotels/${hotelA}/cancellation-policies`).set(bearer(adminToken));
  const freeCancel = policies.body.policies.find((p) => p.code === 'FREE_CANCELLATION');
  const partial = policies.body.policies.find((p) => p.code === 'PARTIAL_REFUND');
  const plan = await request(app).post(`/api/admin/room-types/${roomA}/rate-plans`).set(bearer(adminToken)).send({
    code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, cancellationPolicyId: freeCancel.id, discountPercent: 10, taxPercent: 12, feeMinor: 5000,
  });
  planA = plan.body.ratePlan.id;
  const planPartial = await request(app).post(`/api/admin/room-types/${roomA}/rate-plans`).set(bearer(adminToken)).send({
    code: 'PARTIAL', name: 'Partial refund', mealPlan: 'BREAKFAST', isRefundable: true, cancellationPolicyId: partial.id, discountPercent: 0, taxPercent: 12, feeMinor: 0,
  });
  planPartialA = planPartial.body.ratePlan.id;
  await request(app).post(`/api/admin/room-types/${roomA}/calendar/bulk`).set(bearer(adminToken)).send({ from: day(0), to: day(60), ratePlanId: planA, basePriceMinor: 1_000_000 });
  await request(app).post(`/api/admin/room-types/${roomA}/calendar/bulk`).set(bearer(adminToken)).send({ from: day(0), to: day(60), ratePlanId: planPartialA, basePriceMinor: 1_000_000 });

  const managerAId = (await pool.query(`SELECT id FROM users WHERE email = $1`, ['managerA@example.com'])).rows[0].id;
  await pool.query(`INSERT INTO hotel_managers (user_id, hotel_id) VALUES ($1, $2)`, [managerAId, hotelA]);
});

after(async () => {
  await closeTestDatabase();
  rmSync(MEDIA_DIR, { recursive: true, force: true });
});

describe('GET /api/bookings/:id/invoice (owner)', () => {
  it('the booking owner can download a real PDF invoice', async () => {
    const booking = await confirmedBooking(guestToken, { offset: 0 });
    const res = await request(app).get(`/api/bookings/${booking.id}/invoice`).set(bearer(guestToken));
    assertRealPdf(res);
  });

  it('includes the discount, taxes, fees and GST/billing/company details without crashing when present', async () => {
    const booking = await confirmedBooking(guestToken, { offset: 2, gstNumber: '27AAAPL1234C1ZV', companyName: 'Acme Travel', billingAddress: '221B Baker Street, Mumbai 400001' });
    const res = await request(app).get(`/api/bookings/${booking.id}/invoice`).set(bearer(guestToken));
    assertRealPdf(res);
    // Correct totals, from the booking's own snapshot: base 1,000,000 - 10% discount + 12% tax + a flat fee.
    assert.equal(booking.amounts.discount, 100_000);
    assert.equal(booking.amounts.total, booking.amounts.subtotal - booking.amounts.discount + booking.amounts.taxes + booking.amounts.fees);
  });

  it('includes a payment reference once paid', async () => {
    const booking = await confirmedBooking(guestToken, { offset: 4 });
    assert.ok(booking.payment, 'the booking DTO the invoice is built from already carries a payment reference');
    const res = await request(app).get(`/api/bookings/${booking.id}/invoice`).set(bearer(guestToken));
    assertRealPdf(res);
  });

  it('includes refund information for a cancelled, partially-refunded booking', async () => {
    const booking = await confirmedBooking(guestToken, { offset: 6, planId: planPartialA });
    const cancelled = await request(app).post(`/api/bookings/${booking.id}/cancel`).set(bearer(guestToken)).send({ reason: 'Plans changed' });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.ok(cancelled.body.booking.amounts.refunded > 0, 'a partial-refund policy actually refunds something to exercise the refund section');

    const res = await request(app).get(`/api/bookings/${booking.id}/invoice`).set(bearer(guestToken));
    assertRealPdf(res);
  });

  it('another customer cannot download someone else’s invoice (IDOR)', async () => {
    const booking = await confirmedBooking(guestToken, { offset: 8 });
    const res = await request(app).get(`/api/bookings/${booking.id}/invoice`).set(bearer(otherToken));
    assert.equal(res.status, 404);
  });

  it('requires authentication', async () => {
    const booking = await confirmedBooking(guestToken, { offset: 10 });
    const res = await request(app).get(`/api/bookings/${booking.id}/invoice`);
    assert.equal(res.status, 401);
  });

  it('rejects a non-numeric booking id at the validation layer, not with a database error', async () => {
    const res = await request(app).get('/api/bookings/not-a-number/invoice').set(bearer(guestToken));
    assert.equal(res.status, 422);
  });
});

describe('GET /api/admin/bookings/:id/invoice (staff)', () => {
  it('ADMIN can download the invoice for any booking', async () => {
    const booking = await confirmedBooking(guestToken, { offset: 12 });
    const res = await request(app).get(`/api/admin/bookings/${booking.id}/invoice`).set(bearer(adminToken));
    assertRealPdf(res);
  });

  it('a HOTEL_OWNER can download an invoice for their own hotel’s booking', async () => {
    const booking = await confirmedBooking(guestToken, { offset: 14 });
    const res = await request(app).get(`/api/admin/bookings/${booking.id}/invoice`).set(bearer(managerAToken));
    assertRealPdf(res);
  });

  it('a HOTEL_OWNER cannot download an invoice for another hotel’s booking (cross-hotel IDOR)', async () => {
    const booking = await confirmedBooking(guestToken, { offset: 16 });
    const res = await request(app).get(`/api/admin/bookings/${booking.id}/invoice`).set(bearer(managerBToken));
    assert.equal(res.status, 404);
  });

  it('a plain customer cannot reach the staff invoice route at all', async () => {
    const booking = await confirmedBooking(guestToken, { offset: 18 });
    const res = await request(app).get(`/api/admin/bookings/${booking.id}/invoice`).set(bearer(guestToken));
    assert.equal(res.status, 403);
  });
});
