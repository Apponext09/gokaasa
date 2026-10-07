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

const MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'gokaasa-notifications-'));
process.env.MEDIA_DIR = MEDIA_DIR;

const PASSWORD = 'Strong-pass-123';
const TODAY = localToday('Asia/Kolkata');
const D0 = addDays(TODAY, 30);

let app;
let adminToken, managerToken, guestToken, otherToken;
let hotelId, roomId, planId;

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
    .send({ description: 'Notification test hotel', starRating: 4, addressLine: '1 Notify Road', latitude: 18.9, longitude: 72.8 });
  await pool.query(`INSERT INTO hotel_images (hotel_id, category, source_url, is_cover) VALUES ($1, 'EXTERIOR', 'https://example.com/n.jpg', true)`, [id]);
  await request(app).put(`/api/admin/hotels/${id}/amenities`).set(bearer(adminToken)).send({ codes: ['WIFI'] });
  for (const action of ['SUBMIT_FOR_REVIEW', 'MARK_READY', 'PUBLISH']) {
    const res = await request(app).post(`/api/admin/hotels/${id}/status`).set(bearer(adminToken)).send({ action });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  }
  return id;
}

async function confirmedBooking(token, offset) {
  const checkIn = day(offset);
  const hold = await request(app).post('/api/booking/holds').set(bearer(token)).send({
    hotelId, roomTypeId: roomId, ratePlanId: planId, checkIn, checkOut: addDays(checkIn, 1), rooms: 1,
    occupancy: [{ adults: 2, childAges: [] }],
  });
  assert.equal(hold.status, 201, JSON.stringify(hold.body));
  const holdId = hold.body.hold.id;
  const guests = await request(app).put(`/api/booking/holds/${holdId}/guests`).set(bearer(token)).send({
    primaryContact: { firstName: 'Notify', lastName: 'Guest', email: 'notify.guest@example.com', mobile: '+919876500002' },
    rooms: [{ roomIndex: 0, guests: [{ firstName: 'Notify', lastName: 'Guest', age: 30 }, { firstName: 'Co', lastName: 'Traveller', age: 28 }] }],
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
  await createUserWithRole({ email: 'manager@example.com', password: PASSWORD, roleCode: 'HOTEL_MANAGER' });
  await createUserWithRole({ email: 'notify.guest@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  await createUserWithRole({ email: 'notify.other@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  adminToken = await loginAs('admin@example.com');
  managerToken = await loginAs('manager@example.com');
  guestToken = await loginAs('notify.guest@example.com');
  otherToken = await loginAs('notify.other@example.com');

  hotelId = await publishedHotel('Notification Test Hotel');
  const room = await request(app).post(`/api/admin/hotels/${hotelId}/room-types`).set(bearer(adminToken)).send({
    name: 'Deluxe Room', roomCode: 'DLX', category: 'DELUXE', bedType: 'KING', bedCount: 1,
    maxAdults: 2, maxChildren: 1, maxOccupancy: 3, smoking: 'NON_SMOKING', totalUnits: 4,
  });
  roomId = room.body.roomType.id;
  const policies = await request(app).get(`/api/admin/hotels/${hotelId}/cancellation-policies`).set(bearer(adminToken));
  const policy = policies.body.policies.find((p) => p.code === 'FREE_CANCELLATION');
  const plan = await request(app).post(`/api/admin/room-types/${roomId}/rate-plans`).set(bearer(adminToken)).send({
    code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, cancellationPolicyId: policy.id, discountPercent: 0, taxPercent: 12, feeMinor: 0,
  });
  planId = plan.body.ratePlan.id;
  await request(app).post(`/api/admin/room-types/${roomId}/calendar/bulk`).set(bearer(adminToken)).send({ from: day(0), to: day(60), ratePlanId: planId, basePriceMinor: 1_000_000 });

  const managerId = (await pool.query(`SELECT id FROM users WHERE email = $1`, ['manager@example.com'])).rows[0].id;
  await pool.query(`INSERT INTO hotel_managers (user_id, hotel_id) VALUES ($1, $2)`, [managerId, hotelId]);
});

after(async () => {
  await closeTestDatabase();
  rmSync(MEDIA_DIR, { recursive: true, force: true });
});

/** Notifications are created fire-and-forget after the triggering request responds; give the write a moment to land. */
async function waitForNotification(userId, type, { timeoutMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await pool.query(`SELECT * FROM notifications WHERE user_id = $1 AND type = $2 ORDER BY id DESC LIMIT 1`, [userId, type]);
    if (rows[0]) return rows[0];
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`No notification of type "${type}" appeared for user ${userId} within ${timeoutMs}ms`);
}

describe('booking events create real, persisted notifications', () => {
  it('a confirmed booking notifies the guest and the hotel’s assigned manager', async () => {
    const booking = await confirmedBooking(guestToken, 0);
    const guestId = (await pool.query(`SELECT id FROM users WHERE email = $1`, ['notify.guest@example.com'])).rows[0].id;
    const managerId = (await pool.query(`SELECT id FROM users WHERE email = $1`, ['manager@example.com'])).rows[0].id;

    const guestNotice = await waitForNotification(guestId, 'booking.confirmed');
    assert.ok(guestNotice.message.includes(booking.bookingRef));

    const managerNotice = await waitForNotification(managerId, 'booking.created');
    assert.ok(managerNotice.message.includes(booking.bookingRef));
  });

  it('a cancelled booking notifies the guest', async () => {
    const booking = await confirmedBooking(guestToken, 2);
    const guestId = (await pool.query(`SELECT id FROM users WHERE email = $1`, ['notify.guest@example.com'])).rows[0].id;

    const cancelled = await request(app).post(`/api/bookings/${booking.id}/cancel`).set(bearer(guestToken)).send({});
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));

    const notice = await waitForNotification(guestId, 'booking.cancelled');
    assert.ok(notice.message.includes(booking.bookingRef));
  });
});

describe('review events notify the right audience', () => {
  it('submitting a review notifies the hotel’s manager and every admin; moderating it notifies the author', async () => {
    const booking = await confirmedBooking(guestToken, 4);
    await pool.query(`UPDATE bookings SET check_in = $2, check_out = $3 WHERE id = $1`, [booking.id, addDays(TODAY, -3), addDays(TODAY, -2)]);

    const created = await request(app).post('/api/reviews').set(bearer(guestToken)).send({ bookingId: booking.id, rating: 5, body: 'A review used to test the notification wiring end to end.' });
    assert.equal(created.status, 201, JSON.stringify(created.body));

    const managerId = (await pool.query(`SELECT id FROM users WHERE email = $1`, ['manager@example.com'])).rows[0].id;
    const adminId = (await pool.query(`SELECT id FROM users WHERE email = $1`, ['admin@example.com'])).rows[0].id;
    await waitForNotification(managerId, 'review.submitted');
    await waitForNotification(adminId, 'review.submitted');

    const approved = await request(app).post(`/api/admin/reviews/${created.body.review.id}/moderate`).set(bearer(adminToken)).send({ action: 'APPROVE' });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));

    const guestId = (await pool.query(`SELECT id FROM users WHERE email = $1`, ['notify.guest@example.com'])).rows[0].id;
    const decision = await waitForNotification(guestId, 'review.approved');
    assert.ok(decision.message.length > 0);
  });
});

describe('manager assignment notifies the manager', () => {
  it('assigning a manager to a hotel notifies that manager', async () => {
    const freshHotel = await publishedHotel('Notification Second Hotel');
    await createUserWithRole({ email: 'manager.second@example.com', password: PASSWORD, roleCode: 'HOTEL_MANAGER' });
    const secondManagerId = (await pool.query(`SELECT id FROM users WHERE email = $1`, ['manager.second@example.com'])).rows[0].id;

    const assigned = await request(app).post(`/api/admin/hotels/${freshHotel}/managers`).set(bearer(adminToken)).send({ userId: secondManagerId });
    assert.equal(assigned.status, 201, JSON.stringify(assigned.body));

    const notice = await waitForNotification(secondManagerId, 'manager.assigned');
    assert.ok(notice.message.includes('Notification Second Hotel'));
  });
});

describe('notifications API: list, unread count, mark read, mark all read, IDOR', () => {
  it('a guest sees only their own notifications, newest first, paginated', async () => {
    await confirmedBooking(guestToken, 6);
    const res = await request(app).get('/api/notifications').set(bearer(guestToken));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.items.length > 0);
    assert.ok(res.body.pagination.total >= res.body.items.length);

    const othersView = await request(app).get('/api/notifications').set(bearer(otherToken));
    assert.equal(othersView.status, 200);
    assert.equal(othersView.body.items.length, 0, 'a customer with no triggering activity has no notifications');
  });

  it('unread count reflects reality and drops as notifications are read', async () => {
    const before = await request(app).get('/api/notifications/unread-count').set(bearer(guestToken));
    assert.equal(before.status, 200);
    assert.ok(before.body.count > 0);

    const list = await request(app).get('/api/notifications?limit=1').set(bearer(guestToken));
    const id = list.body.items[0].id;
    const marked = await request(app).patch(`/api/notifications/${id}/read`).set(bearer(guestToken));
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    assert.equal(marked.body.notification.read, true);

    const after = await request(app).get('/api/notifications/unread-count').set(bearer(guestToken));
    assert.equal(after.body.count, before.body.count - 1);

    // Idempotent: marking the same one again does not error or change the count further.
    const again = await request(app).patch(`/api/notifications/${id}/read`).set(bearer(guestToken));
    assert.equal(again.status, 200);
    const stillAfter = await request(app).get('/api/notifications/unread-count').set(bearer(guestToken));
    assert.equal(stillAfter.body.count, after.body.count);
  });

  it('mark-all-read zeroes the unread count', async () => {
    const markedAll = await request(app).patch('/api/notifications/read-all').set(bearer(guestToken));
    assert.equal(markedAll.status, 200, JSON.stringify(markedAll.body));
    const after = await request(app).get('/api/notifications/unread-count').set(bearer(guestToken));
    assert.equal(after.body.count, 0);
  });

  it('IDOR: a customer cannot mark another customer’s notification as read', async () => {
    const mine = await request(app).get('/api/notifications').set(bearer(guestToken));
    assert.ok(mine.body.items.length > 0);
    const someoneElsesId = mine.body.items[0].id;

    const attempt = await request(app).patch(`/api/notifications/${someoneElsesId}/read`).set(bearer(otherToken));
    assert.equal(attempt.status, 404);
  });

  it('requires authentication', async () => {
    assert.equal((await request(app).get('/api/notifications')).status, 401);
    assert.equal((await request(app).get('/api/notifications/unread-count')).status, 401);
    assert.equal((await request(app).patch('/api/notifications/1/read')).status, 401);
  });
});
