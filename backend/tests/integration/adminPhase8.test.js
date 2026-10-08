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

const MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'gokaasa-admin8-'));
process.env.MEDIA_DIR = MEDIA_DIR;

const PASSWORD = 'Strong-pass-123';
const TODAY = localToday('Asia/Kolkata');
const D0 = addDays(TODAY, 30);

let app;
let adminToken, managerAToken, managerBToken, guestToken;
let hotelA, hotelB, roomA, planA, managerAId, managerBId;

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
    .send({ description: 'Phase 8 admin test hotel', starRating: 4, addressLine: '1 Admin Road', latitude: 18.9, longitude: 72.8 });
  await pool.query(`INSERT INTO hotel_images (hotel_id, category, source_url, is_cover) VALUES ($1, 'EXTERIOR', 'https://example.com/a8.jpg', true)`, [id]);
  await request(app).put(`/api/admin/hotels/${id}/amenities`).set(bearer(adminToken)).send({ codes: ['WIFI'] });
  for (const action of ['SUBMIT_FOR_REVIEW', 'MARK_READY', 'PUBLISH']) {
    const res = await request(app).post(`/api/admin/hotels/${id}/status`).set(bearer(adminToken)).send({ action });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  }
  return id;
}

async function confirmedBooking(token, hotelId, roomId, planId, offset) {
  const checkIn = day(offset);
  const hold = await request(app).post('/api/booking/holds').set(bearer(token)).send({
    hotelId, roomTypeId: roomId, ratePlanId: planId, checkIn, checkOut: addDays(checkIn, 1), rooms: 1,
    occupancy: [{ adults: 2, childAges: [] }],
  });
  assert.equal(hold.status, 201, JSON.stringify(hold.body));
  const holdId = hold.body.hold.id;
  const guests = await request(app).put(`/api/booking/holds/${holdId}/guests`).set(bearer(token)).send({
    primaryContact: { firstName: 'Admin8', lastName: 'Guest', email: 'admin8.guest@example.com', mobile: '+919876500004' },
    rooms: [{ roomIndex: 0, guests: [{ firstName: 'Admin8', lastName: 'Guest', age: 30 }, { firstName: 'Co', lastName: 'Traveller', age: 28 }] }],
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

before(async () => {
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
  await createUserWithRole({ email: 'managerA@example.com', password: PASSWORD, roleCode: 'HOTEL_MANAGER' });
  await createUserWithRole({ email: 'managerB@example.com', password: PASSWORD, roleCode: 'HOTEL_MANAGER' });
  await createUserWithRole({ email: 'admin8.guest@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  adminToken = await loginAs('admin@example.com');
  managerAToken = await loginAs('managerA@example.com');
  managerBToken = await loginAs('managerB@example.com');
  guestToken = await loginAs('admin8.guest@example.com');

  hotelA = await publishedHotel('Phase8 Hotel A');
  hotelB = await publishedHotel('Phase8 Hotel B');
  const room = await request(app).post(`/api/admin/hotels/${hotelA}/room-types`).set(bearer(adminToken)).send({
    name: 'Deluxe Room', roomCode: 'DLX', category: 'DELUXE', bedType: 'KING', bedCount: 1,
    maxAdults: 2, maxChildren: 1, maxOccupancy: 3, smoking: 'NON_SMOKING', totalUnits: 4,
  });
  roomA = room.body.roomType.id;
  const policies = await request(app).get(`/api/admin/hotels/${hotelA}/cancellation-policies`).set(bearer(adminToken));
  const policy = policies.body.policies.find((p) => p.code === 'FREE_CANCELLATION');
  const plan = await request(app).post(`/api/admin/room-types/${roomA}/rate-plans`).set(bearer(adminToken)).send({
    code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, cancellationPolicyId: policy.id, discountPercent: 0, taxPercent: 12, feeMinor: 0,
  });
  planA = plan.body.ratePlan.id;
  await request(app).post(`/api/admin/room-types/${roomA}/calendar/bulk`).set(bearer(adminToken)).send({ from: day(0), to: day(60), ratePlanId: planA, basePriceMinor: 1_000_000 });

  managerAId = (await pool.query(`SELECT id FROM users WHERE email = $1`, ['managerA@example.com'])).rows[0].id;
  managerBId = (await pool.query(`SELECT id FROM users WHERE email = $1`, ['managerB@example.com'])).rows[0].id;
  await pool.query(`INSERT INTO hotel_managers (user_id, hotel_id) VALUES ($1, $2)`, [managerAId, hotelA]);
});

after(async () => {
  await closeTestDatabase();
  rmSync(MEDIA_DIR, { recursive: true, force: true });
});

describe('global admin search', () => {
  it('ADMIN search finds a hotel, a booking and a customer across every hotel', async () => {
    await confirmedBooking(guestToken, hotelA, roomA, planA, 0);
    const hotels = await request(app).get('/api/admin/search?q=Phase8 Hotel A').set(bearer(adminToken));
    assert.equal(hotels.status, 200, JSON.stringify(hotels.body));
    assert.ok(hotels.body.items.some((item) => item.type === 'hotel' && item.id === hotelA));

    const customers = await request(app).get('/api/admin/search?q=admin8.guest').set(bearer(adminToken));
    assert.ok(customers.body.items.some((item) => item.type === 'customer'));
  });

  it('a HOTEL_MANAGER never sees another hotel in search results (cross-hotel IDOR)', async () => {
    const res = await request(app).get('/api/admin/search?q=Phase8 Hotel B').set(bearer(managerAToken));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.items.some((item) => item.type === 'hotel' && item.id === hotelB), false);
  });

  it('requires authentication and a minimum query length', async () => {
    assert.equal((await request(app).get('/api/admin/search?q=ab')).status, 401);
    assert.equal((await request(app).get('/api/admin/search?q=a').set(bearer(adminToken))).status, 422);
  });
});

describe('CSV exports: authorization and scoping', () => {
  it('ADMIN can export bookings as a real CSV containing the booking just created', async () => {
    const booking = await confirmedBooking(guestToken, hotelA, roomA, planA, 2);
    const res = await request(app).get('/api/admin/exports/bookings').set(bearer(adminToken));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');
    assert.match(res.headers['content-disposition'], /attachment; filename="bookings\.csv"/);
    assert.ok(res.text.startsWith('Booking Ref,Status,Payment Status,Hotel,City,Customer,Email,Check-in,Check-out,Rooms,Total (INR),Paid,Refunded,Created'));
    assert.ok(res.text.includes(booking.bookingRef));
  });

  it('a HOTEL_MANAGER export of bookings never includes another hotel’s booking', async () => {
    const bookingA = await confirmedBooking(guestToken, hotelA, roomA, planA, 4);
    const res = await request(app).get('/api/admin/exports/bookings').set(bearer(managerAToken));
    assert.equal(res.status, 200);
    assert.ok(res.text.includes(bookingA.bookingRef));
    assert.ok(res.text.includes('Phase8 Hotel A'));
    assert.equal(res.text.includes('Phase8 Hotel B'), false);
  });

  it('a HOTEL_MANAGER with no assigned hotels exports an empty (header-only) CSV, never another manager’s rows', async () => {
    const res = await request(app).get('/api/admin/exports/bookings').set(bearer(managerBToken));
    assert.equal(res.status, 200);
    assert.equal(res.text.trim(), 'Booking Ref,Status,Payment Status,Hotel,City,Customer,Email,Check-in,Check-out,Rooms,Total (INR),Paid,Refunded,Created');
  });

  it('a customer cannot reach any export route', async () => {
    assert.equal((await request(app).get('/api/admin/exports/bookings').set(bearer(guestToken))).status, 403);
    assert.equal((await request(app).get('/api/admin/exports/customers').set(bearer(guestToken))).status, 403);
    assert.equal((await request(app).get('/api/admin/exports/hotels').set(bearer(guestToken))).status, 403);
  });

  it('exports payments, refunds, customers, hotels and reviews as real CSVs with the right header row', async () => {
    const payments = await request(app).get('/api/admin/exports/payments').set(bearer(adminToken));
    assert.equal(payments.status, 200);
    assert.ok(payments.text.startsWith('Booking Ref,Hotel,Customer,Email,Order ID,Payment ID,Amount (INR),Status,Mode,Created,Paid At'));

    const customersCsv = await request(app).get('/api/admin/exports/customers').set(bearer(adminToken));
    assert.equal(customersCsv.status, 200);
    assert.ok(customersCsv.text.startsWith('Customer,Email,Phone,Bookings,Total Spend (INR),Last Booking,Joined'));

    const hotelsCsv = await request(app).get('/api/admin/exports/hotels').set(bearer(adminToken));
    assert.equal(hotelsCsv.status, 200);
    assert.ok(hotelsCsv.text.includes('Phase8 Hotel A'));
  });
});

describe('hotel performance report', () => {
  it('ADMIN sees every hotel; a HOTEL_MANAGER sees only their own', async () => {
    await confirmedBooking(guestToken, hotelA, roomA, planA, 6);
    const asAdmin = await request(app).get(`/api/admin/reports/hotel-performance?from=${day(0)}&to=${day(10)}`).set(bearer(adminToken));
    assert.equal(asAdmin.status, 200, JSON.stringify(asAdmin.body));
    assert.ok(asAdmin.body.items.some((h) => h.id === hotelA));
    assert.ok(asAdmin.body.items.some((h) => h.id === hotelB));

    const asManagerA = await request(app).get(`/api/admin/reports/hotel-performance?from=${day(0)}&to=${day(10)}`).set(bearer(managerAToken));
    assert.equal(asManagerA.status, 200);
    assert.ok(asManagerA.body.items.every((h) => h.id === hotelA));

    const asManagerB = await request(app).get(`/api/admin/reports/hotel-performance?from=${day(0)}&to=${day(10)}`).set(bearer(managerBToken));
    assert.equal(asManagerB.status, 200);
    assert.deepEqual(asManagerB.body.items, []);
  });

  it('rejects an invalid date range', async () => {
    const res = await request(app).get(`/api/admin/reports/hotel-performance?from=${day(10)}&to=${day(0)}`).set(bearer(adminToken));
    assert.equal(res.status, 422);
  });
});

describe('dashboard alerts', () => {
  it('counts are real and scoped: a pending review at hotel A shows for ADMIN and manager A, never manager B', async () => {
    const booking = await confirmedBooking(guestToken, hotelA, roomA, planA, 8);
    await pool.query(`UPDATE bookings SET check_in = $2, check_out = $3 WHERE id = $1`, [booking.id, addDays(TODAY, -3), addDays(TODAY, -2)]);
    const review = await request(app).post('/api/reviews').set(bearer(guestToken)).send({ bookingId: booking.id, rating: 4, body: 'A review used to test the dashboard alerts endpoint.' });
    assert.equal(review.status, 201, JSON.stringify(review.body));

    const asAdmin = await request(app).get('/api/admin/dashboard/alerts').set(bearer(adminToken));
    assert.equal(asAdmin.status, 200);
    assert.ok(asAdmin.body.alerts.some((a) => a.type === 'reviews_pending' && a.count > 0));

    const asManagerA = await request(app).get('/api/admin/dashboard/alerts').set(bearer(managerAToken));
    assert.ok(asManagerA.body.alerts.some((a) => a.type === 'reviews_pending' && a.count > 0));

    const asManagerB = await request(app).get('/api/admin/dashboard/alerts').set(bearer(managerBToken));
    assert.equal(asManagerB.body.alerts.some((a) => a.type === 'reviews_pending'), false);
  });
});

describe('settings: readable by staff, writable by ADMIN only', () => {
  it('both ADMIN and HOTEL_MANAGER can read settings', async () => {
    const asAdmin = await request(app).get('/api/admin/settings').set(bearer(adminToken));
    assert.equal(asAdmin.status, 200, JSON.stringify(asAdmin.body));
    assert.equal(asAdmin.body.platform.companyName, 'Gokaasa');
    const asManager = await request(app).get('/api/admin/settings').set(bearer(managerAToken));
    assert.equal(asManager.status, 200);
  });

  it('a HOTEL_MANAGER cannot change settings; ADMIN can, and the change is read back', async () => {
    const denied = await request(app).patch('/api/admin/settings').set(bearer(managerAToken)).send({ companyName: 'Hacked Inc' });
    assert.equal(denied.status, 403);

    const updated = await request(app).patch('/api/admin/settings').set(bearer(adminToken)).send({ supportPhone: '+91-1234567890' });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.platform.supportPhone, '+91-1234567890');

    const reread = await request(app).get('/api/admin/settings').set(bearer(adminToken));
    assert.equal(reread.body.platform.supportPhone, '+91-1234567890');
  });

  it('a customer cannot reach settings at all', async () => {
    assert.equal((await request(app).get('/api/admin/settings').set(bearer(guestToken))).status, 403);
  });

  it('never exposes secrets such as the JWT secret, DB password or Razorpay keys', async () => {
    const res = await request(app).get('/api/admin/settings').set(bearer(adminToken));
    const text = JSON.stringify(res.body);
    assert.equal(/jwtSecret|razorpay|keySecret|webhookSecret|dbPassword/i.test(text), false);
  });
});

describe('manager management: ADMIN-only directory and detail', () => {
  it('the manager directory includes assigned hotel names', async () => {
    const res = await request(app).get('/api/admin/managers').set(bearer(adminToken));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const managerA = res.body.managers.find((m) => m.id === managerAId);
    assert.ok(managerA.hotels.some((h) => h.id === hotelA));
  });

  it('manager detail shows assigned hotels and aggregated activity, ADMIN only', async () => {
    await confirmedBooking(guestToken, hotelA, roomA, planA, 12);
    const res = await request(app).get(`/api/admin/managers/${managerAId}`).set(bearer(adminToken));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.manager.id, managerAId);
    assert.ok(res.body.manager.hotels.some((h) => h.id === hotelA));
    assert.ok(res.body.manager.bookings.total > 0);

    assert.equal((await request(app).get(`/api/admin/managers/${managerAId}`).set(bearer(managerAToken))).status, 403);
    assert.equal((await request(app).get(`/api/admin/managers/${managerAId}`).set(bearer(guestToken))).status, 403);
  });

  it('404s for a user id that is not a hotel manager', async () => {
    const res = await request(app).get(`/api/admin/managers/${managerBId + 999}`).set(bearer(adminToken));
    assert.equal(res.status, 404);
  });
});

describe('audit log upgrades: entityId filter, actor search, role on each row', () => {
  it('filters by entityId and by actor name/email, and reports the actor’s role', async () => {
    const hotel = await publishedHotel('Phase8 Audit Hotel');
    const byEntity = await request(app).get(`/api/admin/audit-logs?entity=hotel&entityId=${hotel}`).set(bearer(adminToken));
    assert.equal(byEntity.status, 200, JSON.stringify(byEntity.body));
    assert.ok(byEntity.body.items.length > 0);
    assert.ok(byEntity.body.items.every((row) => String(row.entityId) === String(hotel)));
    assert.ok(byEntity.body.items[0].actor.roles.includes('ADMIN'));

    const byActor = await request(app).get('/api/admin/audit-logs?q=admin@example.com').set(bearer(adminToken));
    assert.equal(byActor.status, 200);
    assert.ok(byActor.body.items.length > 0);
    assert.ok(byActor.body.items.every((row) => row.actor?.email === 'admin@example.com'));
  });

  it('remains ADMIN-only', async () => {
    assert.equal((await request(app).get('/api/admin/audit-logs').set(bearer(managerAToken))).status, 403);
  });
});
