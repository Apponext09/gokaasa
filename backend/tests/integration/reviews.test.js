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

const MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'gokaasa-reviews-'));
process.env.MEDIA_DIR = MEDIA_DIR;

const PASSWORD = 'Strong-pass-123';
const TODAY = localToday('Asia/Kolkata');
const D0 = addDays(TODAY, 30);

let app;
let adminToken, managerAToken;
let guestToken, otherToken, thirdToken, fourthToken, fifthToken, sixthToken;
let hotelA, hotelB;
let roomA, planA, roomB, planB;
let isolatedCounter = 0;

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
    .send({ description: 'Review test hotel', starRating: 4, addressLine: '1 Review Road', latitude: 18.9, longitude: 72.8 });
  await pool.query(`INSERT INTO hotel_images (hotel_id, category, source_url, is_cover) VALUES ($1, 'EXTERIOR', 'https://example.com/r.jpg', true)`, [id]);
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

/** A hotel used by exactly one isolated test, so "one review per guest per hotel" can never collide across tests. */
async function freshHotelAndRoom() {
  isolatedCounter += 1;
  const hotelId = await publishedHotel(`Review Isolated Hotel ${isolatedCounter}`);
  const roomId = await createRoom(hotelId, { roomCode: 'DLX' });
  const planId = await createPlan(hotelId, roomId);
  await priceNights(roomId, planId, 0, 5);
  return { hotelId, roomId, planId };
}

/** Books and pays via the simulated gateway. Returns the confirmed booking. */
async function confirmedBooking(token, hotelId, roomId, planId, offset) {
  const checkIn = day(offset);
  const hold = await request(app).post('/api/booking/holds').set(bearer(token)).send({
    hotelId, roomTypeId: roomId, ratePlanId: planId, checkIn, checkOut: addDays(checkIn, 1), rooms: 1,
    occupancy: [{ adults: 2, childAges: [] }],
  });
  assert.equal(hold.status, 201, JSON.stringify(hold.body));
  const holdId = hold.body.hold.id;
  const guests = await request(app).put(`/api/booking/holds/${holdId}/guests`).set(bearer(token)).send({
    primaryContact: { firstName: 'Review', lastName: 'Guest', email: 'review.guest@example.com', mobile: '+919876500001' },
    rooms: [{ roomIndex: 0, guests: [{ firstName: 'Review', lastName: 'Guest', age: 30 }, { firstName: 'Co', lastName: 'Traveller', age: 28 }] }],
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

/** Pushes a confirmed booking's stay into the past, exactly the definition My Trips' "completed" tab already uses. */
async function markCompleted(bookingId) {
  const checkOut = addDays(TODAY, -2);
  const checkIn = addDays(TODAY, -3);
  await pool.query(`UPDATE bookings SET check_in = $2, check_out = $3 WHERE id = $1`, [bookingId, checkIn, checkOut]);
}

async function markCancelled(bookingId) {
  await pool.query(`UPDATE bookings SET status = 'REFUNDED', cancelled_at = now() WHERE id = $1`, [bookingId]);
}

/** Books, confirms and completes a stay in one call, ready for a review. */
async function completedBooking(token, hotelId, roomId, planId, offset) {
  const booking = await confirmedBooking(token, hotelId, roomId, planId, offset);
  await markCompleted(booking.id);
  return booking;
}

before(async () => {
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
  await createUserWithRole({ email: 'managerA@example.com', password: PASSWORD, roleCode: 'HOTEL_OWNER' });
  for (const email of ['review.guest@example.com', 'review.other@example.com', 'review.third@example.com', 'review.fourth@example.com', 'review.fifth@example.com', 'review.sixth@example.com']) {
    await createUserWithRole({ email, password: PASSWORD, roleCode: 'CUSTOMER' });
  }
  adminToken = await loginAs('admin@example.com');
  managerAToken = await loginAs('managerA@example.com');
  guestToken = await loginAs('review.guest@example.com');
  otherToken = await loginAs('review.other@example.com');
  thirdToken = await loginAs('review.third@example.com');
  fourthToken = await loginAs('review.fourth@example.com');
  fifthToken = await loginAs('review.fifth@example.com');
  sixthToken = await loginAs('review.sixth@example.com');

  hotelA = await publishedHotel('Review Test Hotel A');
  hotelB = await publishedHotel('Review Test Hotel B');
  roomA = await createRoom(hotelA, { roomCode: 'DLX' });
  planA = await createPlan(hotelA, roomA);
  await priceNights(roomA, planA, 0, 60);
  roomB = await createRoom(hotelB, { roomCode: 'DLX' });
  planB = await createPlan(hotelB, roomB);
  await priceNights(roomB, planB, 0, 60);

  // Manager A is assigned to Hotel A only, so cross-hotel scoping has something real to deny.
  const managerAId = (await pool.query(`SELECT id FROM users WHERE email = $1`, ['managerA@example.com'])).rows[0].id;
  await pool.query(`INSERT INTO hotel_managers (user_id, hotel_id) VALUES ($1, $2)`, [managerAId, hotelA]);
});

after(async () => {
  await closeTestDatabase();
  rmSync(MEDIA_DIR, { recursive: true, force: true });
});

describe('eligibility', () => {
  it('a completed, unreviewed booking is eligible', async () => {
    const booking = await completedBooking(guestToken, hotelA, roomA, planA, 0);
    const res = await request(app).get(`/api/reviews/eligibility/${booking.id}`).set(bearer(guestToken));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.eligible, true);
    assert.equal(res.body.reason, null);
  });

  it('a future (not yet completed) booking is not eligible', async () => {
    const booking = await confirmedBooking(guestToken, hotelA, roomA, planA, 2);
    const res = await request(app).get(`/api/reviews/eligibility/${booking.id}`).set(bearer(guestToken));
    assert.equal(res.status, 200);
    assert.equal(res.body.eligible, false);
    assert.equal(res.body.reason, 'NOT_COMPLETED');
  });

  it('a cancelled stay is not eligible even if the dates have passed', async () => {
    const booking = await completedBooking(guestToken, hotelA, roomA, planA, 4);
    await markCancelled(booking.id);
    const res = await request(app).get(`/api/reviews/eligibility/${booking.id}`).set(bearer(guestToken));
    assert.equal(res.status, 200);
    assert.equal(res.body.eligible, false);
    assert.equal(res.body.reason, 'NOT_COMPLETED');
  });

  it('someone else’s booking id looks exactly like one that does not exist', async () => {
    const booking = await completedBooking(guestToken, hotelA, roomA, planA, 6);
    const res = await request(app).get(`/api/reviews/eligibility/${booking.id}`).set(bearer(otherToken));
    assert.equal(res.status, 404);
  });

  it('a non-numeric or negative booking id is rejected by validation, not by a database error', async () => {
    assert.equal((await request(app).get(`/api/reviews/eligibility/not-a-number`).set(bearer(guestToken))).status, 422);
    assert.equal((await request(app).get(`/api/reviews/eligibility/-1`).set(bearer(guestToken))).status, 422);
  });
});

describe('create: ownership, validation, mass assignment', () => {
  it('creates a review for an eligible booking, defaulting to PENDING', async () => {
    const { hotelId, roomId, planId } = await freshHotelAndRoom();
    const booking = await completedBooking(guestToken, hotelId, roomId, planId, 0);
    const res = await request(app).post('/api/reviews').set(bearer(guestToken)).send({ bookingId: booking.id, rating: 5, title: 'Lovely stay', body: 'Clean rooms and a great breakfast.' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.review.status, 'PENDING');
    assert.equal(res.body.review.hotelId, hotelId);
    assert.equal(res.body.review.rating, 5);
  });

  it('never trusts a client-supplied hotelId: the booking decides it', async () => {
    const { hotelId, roomId, planId } = await freshHotelAndRoom();
    const booking = await completedBooking(guestToken, hotelId, roomId, planId, 0);
    const res = await request(app)
      .post('/api/reviews')
      .set(bearer(guestToken))
      .send({ bookingId: booking.id, hotelId: hotelB, rating: 4, body: 'Trying to attribute this review to the wrong hotel.' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.review.hotelId, hotelId, 'the booking’s real hotel, not the injected one');
  });

  it('rejects a review for a booking that belongs to someone else (IDOR)', async () => {
    const booking = await completedBooking(guestToken, hotelA, roomA, planA, 8);
    const res = await request(app).post('/api/reviews').set(bearer(otherToken)).send({ bookingId: booking.id, rating: 3, body: 'Attempting to review a stay that is not mine.' });
    assert.equal(res.status, 404);
    const stored = await pool.query(`SELECT COUNT(*)::int AS n FROM reviews WHERE booking_id = $1`, [booking.id]);
    assert.equal(stored.rows[0].n, 0);
  });

  it('rejects a review for a booking that has not completed yet', async () => {
    const booking = await confirmedBooking(guestToken, hotelA, roomA, planA, 10);
    const res = await request(app).post('/api/reviews').set(bearer(guestToken)).send({ bookingId: booking.id, rating: 4, body: 'Reviewing before the stay is over.' });
    assert.equal(res.status, 409);
  });

  it('rejects a review for a cancelled booking', async () => {
    const booking = await completedBooking(guestToken, hotelA, roomA, planA, 12);
    await markCancelled(booking.id);
    const res = await request(app).post('/api/reviews').set(bearer(guestToken)).send({ bookingId: booking.id, rating: 2, body: 'Reviewing a cancelled stay.' });
    assert.equal(res.status, 409);
  });

  it('rejects a second review for the same booking, and for the same hotel from a second booking', async () => {
    const booking = await completedBooking(guestToken, hotelA, roomA, planA, 14);
    const first = await request(app).post('/api/reviews').set(bearer(guestToken)).send({ bookingId: booking.id, rating: 5, body: 'First honest review of this stay.' });
    assert.equal(first.status, 201, JSON.stringify(first.body));

    const sameBooking = await request(app).post('/api/reviews').set(bearer(guestToken)).send({ bookingId: booking.id, rating: 1, body: 'Trying to post a duplicate review.' });
    assert.equal(sameBooking.status, 409);

    // A second, different completed stay at the same hotel still cannot produce a second review:
    // reviews.hotel_id/user_id is unique regardless of which booking it is attached to.
    const secondBooking = await completedBooking(guestToken, hotelA, roomA, planA, 15);
    const viaSecondBooking = await request(app).post('/api/reviews').set(bearer(guestToken)).send({ bookingId: secondBooking.id, rating: 2, body: 'A second stay, still the same hotel.' });
    assert.equal(viaSecondBooking.status, 409);

    const stored = await pool.query(`SELECT COUNT(*)::int AS n FROM reviews WHERE hotel_id = $1 AND user_id = (SELECT id FROM users WHERE email = 'review.guest@example.com')`, [hotelA]);
    assert.equal(stored.rows[0].n, 1);
  });

  it('rejects ratings outside 1-5, and non-integer ratings', async () => {
    const booking = await completedBooking(guestToken, hotelA, roomA, planA, 16);
    for (const rating of [0, 6, 3.5, -1]) {
      const res = await request(app).post('/api/reviews').set(bearer(guestToken)).send({ bookingId: booking.id, rating, body: 'Testing an invalid rating value.' });
      assert.equal(res.status, 422, `rating ${rating} should be rejected`);
    }
  });

  it('rejects a review body that is too short or far too long', async () => {
    const booking = await completedBooking(guestToken, hotelA, roomA, planA, 18);
    const tooShort = await request(app).post('/api/reviews').set(bearer(guestToken)).send({ bookingId: booking.id, rating: 4, body: 'short' });
    assert.equal(tooShort.status, 422);
    const tooLong = await request(app).post('/api/reviews').set(bearer(guestToken)).send({ bookingId: booking.id, rating: 4, body: 'x'.repeat(4001) });
    assert.equal(tooLong.status, 422);
  });

  it('rejects a non-numeric or negative booking id at the validation layer', async () => {
    const res = await request(app).post('/api/reviews').set(bearer(guestToken)).send({ bookingId: 'not-a-number', rating: 4, body: 'Testing bad booking id input.' });
    assert.equal(res.status, 422);
  });

  it('stores an XSS payload as inert text, never executed or stripped silently', async () => {
    const { hotelId, roomId, planId } = await freshHotelAndRoom();
    const booking = await completedBooking(guestToken, hotelId, roomId, planId, 0);
    const payload = '<script>alert(1)</script>';
    const res = await request(app).post('/api/reviews').set(bearer(guestToken)).send({ bookingId: booking.id, rating: 4, title: payload, body: `Nice hotel. ${payload} Would stay again.` });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.headers['content-type'].includes('application/json'), true);
    assert.equal(res.body.review.title, payload, 'stored exactly as submitted, as JSON-safe data, not HTML');
    assert.equal(res.body.review.body.includes(payload), true);
  });

  it('a SQL-injection-shaped review survives as literal text and parameterised queries keep the table intact', async () => {
    const { hotelId, roomId, planId } = await freshHotelAndRoom();
    const booking = await completedBooking(guestToken, hotelId, roomId, planId, 0);
    const payload = "Great stay'; DROP TABLE reviews; --";
    const res = await request(app).post('/api/reviews').set(bearer(guestToken)).send({ bookingId: booking.id, rating: 5, body: payload });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.review.body, payload);
    const stillThere = await pool.query(`SELECT COUNT(*)::int AS n FROM reviews`);
    assert.ok(stillThere.rows[0].n > 0, 'the reviews table was never dropped');
  });
});

describe('update and delete: ownership only', () => {
  it('the author can edit their own review, which resets it to PENDING', async () => {
    const { hotelId, roomId, planId } = await freshHotelAndRoom();
    const booking = await completedBooking(guestToken, hotelId, roomId, planId, 0);
    const created = await request(app).post('/api/reviews').set(bearer(guestToken)).send({ bookingId: booking.id, rating: 5, body: 'Originally five stars.' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    await request(app).post(`/api/admin/reviews/${created.body.review.id}/moderate`).set(bearer(adminToken)).send({ action: 'APPROVE' });

    const updated = await request(app).put(`/api/reviews/${created.body.review.id}`).set(bearer(guestToken)).send({ rating: 3, body: 'Revised my opinion after a second look.' });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.review.rating, 3);
    assert.equal(updated.body.review.status, 'PENDING', 'an edit returns to moderation, it does not stay approved');
  });

  it('nobody else can edit or delete another guest’s review (IDOR)', async () => {
    const { hotelId, roomId, planId } = await freshHotelAndRoom();
    const booking = await completedBooking(guestToken, hotelId, roomId, planId, 0);
    const created = await request(app).post('/api/reviews').set(bearer(guestToken)).send({ bookingId: booking.id, rating: 4, body: 'A review that belongs to one guest only.' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const editAttempt = await request(app).put(`/api/reviews/${created.body.review.id}`).set(bearer(otherToken)).send({ rating: 1, body: 'Trying to vandalise someone else’s review.' });
    assert.equal(editAttempt.status, 404);
    const deleteAttempt = await request(app).delete(`/api/reviews/${created.body.review.id}`).set(bearer(otherToken));
    assert.equal(deleteAttempt.status, 404);
    const stillThere = await pool.query(`SELECT rating FROM reviews WHERE id = $1`, [created.body.review.id]);
    assert.equal(stillThere.rows[0].rating, 4, 'the original review is untouched');
  });

  it('the author can delete their own review', async () => {
    const { hotelId, roomId, planId } = await freshHotelAndRoom();
    const booking = await completedBooking(guestToken, hotelId, roomId, planId, 0);
    const created = await request(app).post('/api/reviews').set(bearer(guestToken)).send({ bookingId: booking.id, rating: 2, body: 'A review the author will remove.' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const res = await request(app).delete(`/api/reviews/${created.body.review.id}`).set(bearer(guestToken));
    assert.equal(res.status, 204);
    const gone = await pool.query(`SELECT COUNT(*)::int AS n FROM reviews WHERE id = $1`, [created.body.review.id]);
    assert.equal(gone.rows[0].n, 0);
  });
});

describe('my reviews', () => {
  it('lists only the caller’s own reviews', async () => {
    const { hotelId, roomId, planId } = await freshHotelAndRoom();
    const mine = await completedBooking(guestToken, hotelId, roomId, planId, 0);
    const created = await request(app).post('/api/reviews').set(bearer(guestToken)).send({ bookingId: mine.id, rating: 5, body: 'A review that belongs to this guest.' });
    assert.equal(created.status, 201, JSON.stringify(created.body));

    const res = await request(app).get('/api/reviews/my').set(bearer(guestToken));
    assert.equal(res.status, 200);
    assert.ok(res.body.reviews.some((r) => r.bookingId === mine.id));

    const othersView = await request(app).get('/api/reviews/my').set(bearer(otherToken));
    assert.equal(othersView.body.reviews.some((r) => r.bookingId === mine.id), false);
  });
});

describe('public visibility and rating aggregation', () => {
  it('only APPROVED reviews are public; PENDING and REJECTED are not', async () => {
    const { hotelId, roomId, planId } = await freshHotelAndRoom();
    const approvedBooking = await completedBooking(guestToken, hotelId, roomId, planId, 0);
    const pendingBooking = await completedBooking(otherToken, hotelId, roomId, planId, 1);
    const rejectedBooking = await completedBooking(thirdToken, hotelId, roomId, planId, 2);

    const approved = await request(app).post('/api/reviews').set(bearer(guestToken)).send({ bookingId: approvedBooking.id, rating: 5, title: 'Wonderful', body: 'Everything about this stay was wonderful.' });
    const pending = await request(app).post('/api/reviews').set(bearer(otherToken)).send({ bookingId: pendingBooking.id, rating: 4, title: 'Still pending', body: 'This review has not been moderated yet.' });
    const rejected = await request(app).post('/api/reviews').set(bearer(thirdToken)).send({ bookingId: rejectedBooking.id, rating: 1, title: 'Rejected one', body: 'This review will be rejected by a moderator.' });
    assert.equal(approved.status, 201, JSON.stringify(approved.body));
    assert.equal(pending.status, 201, JSON.stringify(pending.body));
    assert.equal(rejected.status, 201, JSON.stringify(rejected.body));

    await request(app).post(`/api/admin/reviews/${approved.body.review.id}/moderate`).set(bearer(adminToken)).send({ action: 'APPROVE' });
    await request(app).post(`/api/admin/reviews/${rejected.body.review.id}/moderate`).set(bearer(adminToken)).send({ action: 'REJECT', reason: 'Not credible' });

    const publicList = await request(app).get(`/api/hotels/${hotelId}/reviews`);
    assert.equal(publicList.status, 200, JSON.stringify(publicList.body));
    const titles = publicList.body.items.map((r) => r.title);
    assert.ok(titles.includes('Wonderful'));
    assert.equal(titles.includes('Still pending'), false);
    assert.equal(titles.includes('Rejected one'), false);
    // No internal moderation fields leak into the public shape.
    assert.equal('status' in publicList.body.items[0], false);
    assert.equal('moderationReason' in publicList.body.items[0], false);
  });

  it('the rating aggregate reflects only APPROVED reviews, with a correct distribution', async () => {
    const { hotelId, roomId, planId } = await freshHotelAndRoom();
    const b1 = await completedBooking(guestToken, hotelId, roomId, planId, 0);
    const b2 = await completedBooking(otherToken, hotelId, roomId, planId, 1);
    const b3 = await completedBooking(thirdToken, hotelId, roomId, planId, 2);

    const r1 = await request(app).post('/api/reviews').set(bearer(guestToken)).send({ bookingId: b1.id, rating: 5, body: 'Five star aggregate test review.' });
    const r2 = await request(app).post('/api/reviews').set(bearer(otherToken)).send({ bookingId: b2.id, rating: 3, body: 'Three star aggregate test review.' });
    const r3 = await request(app).post('/api/reviews').set(bearer(thirdToken)).send({ bookingId: b3.id, rating: 1, body: 'One star but left pending on purpose.' });
    assert.equal(r1.status, 201, JSON.stringify(r1.body));
    assert.equal(r2.status, 201, JSON.stringify(r2.body));
    assert.equal(r3.status, 201, JSON.stringify(r3.body));

    await request(app).post(`/api/admin/reviews/${r1.body.review.id}/moderate`).set(bearer(adminToken)).send({ action: 'APPROVE' });
    await request(app).post(`/api/admin/reviews/${r2.body.review.id}/moderate`).set(bearer(adminToken)).send({ action: 'APPROVE' });
    // r3 stays PENDING deliberately -- it must not count toward the aggregate.

    const detail = await request(app).get(`/api/hotels/${hotelId}`);
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.hotel.rating.count, 2);
    assert.equal(detail.body.hotel.rating.average, 4, 'average of 5 and 3, rounded to one decimal');
    assert.equal(detail.body.hotel.rating.distribution[5], 1);
    assert.equal(detail.body.hotel.rating.distribution[3], 1);
    assert.equal(detail.body.hotel.rating.distribution[1], 0, 'the pending review is excluded');
  });

  it('a hotel with no approved reviews reports a null average, not zero or an error', async () => {
    const freshHotel = await publishedHotel('Review Test Hotel Fresh');
    const detail = await request(app).get(`/api/hotels/${freshHotel}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.hotel.rating.count, 0);
    assert.equal(detail.body.hotel.rating.average, null);
  });
});

describe('My Trips and Booking Details carry the review state (for the frontend CTA)', () => {
  it('a completed booking with no review yet reports review: null in both the list and the single-booking view', async () => {
    const { hotelId, roomId, planId } = await freshHotelAndRoom();
    const booking = await completedBooking(guestToken, hotelId, roomId, planId, 0);

    const single = await request(app).get(`/api/my-bookings/${booking.id}`).set(bearer(guestToken));
    assert.equal(single.status, 200, JSON.stringify(single.body));
    assert.equal(single.body.booking.review, null);

    const list = await request(app).get('/api/my-bookings?tab=completed').set(bearer(guestToken));
    assert.equal(list.status, 200);
    const row = list.body.items.find((item) => item.id === booking.id);
    assert.ok(row, 'the completed booking is in the completed tab');
    assert.equal(row.review, null);
  });

  it('once reviewed, both views report the review id and its current moderation status', async () => {
    const { hotelId, roomId, planId } = await freshHotelAndRoom();
    const booking = await completedBooking(guestToken, hotelId, roomId, planId, 0);
    const created = await request(app).post('/api/reviews').set(bearer(guestToken)).send({ bookingId: booking.id, rating: 5, body: 'A review the My Trips and booking detail views should both reflect.' });
    assert.equal(created.status, 201, JSON.stringify(created.body));

    const single = await request(app).get(`/api/my-bookings/${booking.id}`).set(bearer(guestToken));
    assert.deepEqual(single.body.booking.review, { id: created.body.review.id, status: 'PENDING' });

    const list = await request(app).get('/api/my-bookings?tab=completed').set(bearer(guestToken));
    const row = list.body.items.find((item) => item.id === booking.id);
    assert.deepEqual(row.review, { id: created.body.review.id, status: 'PENDING' });

    await request(app).post(`/api/admin/reviews/${created.body.review.id}/moderate`).set(bearer(adminToken)).send({ action: 'APPROVE' });
    const afterApproval = await request(app).get(`/api/my-bookings/${booking.id}`).set(bearer(guestToken));
    assert.equal(afterApproval.body.booking.review.status, 'APPROVED');
  });
});

describe('moderation: admin only, hotel-manager read scoping', () => {
  it('ADMIN can approve, reject, hide and restore a review, each step audited', async () => {
    const booking = await completedBooking(otherToken, hotelA, roomA, planA, 20);
    const created = await request(app).post('/api/reviews').set(bearer(otherToken)).send({ bookingId: booking.id, rating: 4, body: 'A review that will travel through every moderation state.' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.review.id;

    const approve = await request(app).post(`/api/admin/reviews/${id}/moderate`).set(bearer(adminToken)).send({ action: 'APPROVE' });
    assert.equal(approve.status, 200, JSON.stringify(approve.body));
    assert.equal(approve.body.review.status, 'APPROVED');

    const hide = await request(app).post(`/api/admin/reviews/${id}/moderate`).set(bearer(adminToken)).send({ action: 'HIDE', reason: 'Flagged by guest services' });
    assert.equal(hide.status, 200);
    assert.equal(hide.body.review.status, 'HIDDEN');

    const restore = await request(app).post(`/api/admin/reviews/${id}/moderate`).set(bearer(adminToken)).send({ action: 'RESTORE' });
    assert.equal(restore.status, 200);
    assert.equal(restore.body.review.status, 'APPROVED');

    const reject = await request(app).post(`/api/admin/reviews/${id}/moderate`).set(bearer(adminToken)).send({ action: 'REJECT', reason: 'Policy violation' });
    assert.equal(reject.status, 200);
    assert.equal(reject.body.review.status, 'REJECTED');

    const audit = await pool.query(`SELECT action FROM audit_logs WHERE entity = 'review' AND entity_id = $1 ORDER BY id`, [String(id)]);
    assert.deepEqual(audit.rows.map((r) => r.action), ['review.created', 'review.approved', 'review.hidden', 'review.restored', 'review.rejected']);
  });

  it('an unknown moderation action is rejected by validation', async () => {
    const booking = await completedBooking(thirdToken, hotelA, roomA, planA, 22);
    const created = await request(app).post('/api/reviews').set(bearer(thirdToken)).send({ bookingId: booking.id, rating: 4, body: 'Review used to test an invalid moderation action.' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const res = await request(app).post(`/api/admin/reviews/${created.body.review.id}/moderate`).set(bearer(adminToken)).send({ action: 'DELETE_FOREVER' });
    assert.equal(res.status, 422);
  });

  it('moderating a non-existent review is not found', async () => {
    const res = await request(app).post('/api/admin/reviews/999999999/moderate').set(bearer(adminToken)).send({ action: 'APPROVE' });
    assert.equal(res.status, 404);
  });

  it('a HOTEL_OWNER cannot moderate even a review that belongs to their own hotel', async () => {
    const booking = await completedBooking(fourthToken, hotelA, roomA, planA, 24);
    const created = await request(app).post('/api/reviews').set(bearer(fourthToken)).send({ bookingId: booking.id, rating: 3, body: 'Hotel manager must not be able to approve this.' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const res = await request(app).post(`/api/admin/reviews/${created.body.review.id}/moderate`).set(bearer(managerAToken)).send({ action: 'APPROVE' });
    assert.equal(res.status, 403);
    const stillPending = await pool.query(`SELECT status FROM reviews WHERE id = $1`, [created.body.review.id]);
    assert.equal(stillPending.rows[0].status, 'PENDING');
  });

  it('a HOTEL_OWNER sees only reviews for their hotel, never another hotel’s (cross-hotel IDOR)', async () => {
    const bookingA = await completedBooking(fifthToken, hotelA, roomA, planA, 26);
    const bookingB = await completedBooking(sixthToken, hotelB, roomB, planB, 28);
    const reviewA = await request(app).post('/api/reviews').set(bearer(fifthToken)).send({ bookingId: bookingA.id, rating: 5, body: 'Belongs to Hotel A, which this manager can see.' });
    const reviewB = await request(app).post('/api/reviews').set(bearer(sixthToken)).send({ bookingId: bookingB.id, rating: 5, body: 'Belongs to Hotel B, which this manager must not see.' });
    assert.equal(reviewA.status, 201, JSON.stringify(reviewA.body));
    assert.equal(reviewB.status, 201, JSON.stringify(reviewB.body));

    const list = await request(app).get('/api/admin/reviews').set(bearer(managerAToken));
    assert.equal(list.status, 200, JSON.stringify(list.body));
    const ids = list.body.items.map((r) => r.id);
    assert.ok(ids.includes(reviewA.body.review.id), 'their own hotel’s review is visible');
    assert.equal(ids.includes(reviewB.body.review.id), false, 'another hotel’s review must not leak through');

    // Explicitly asking for Hotel B by id does not bypass the scope either.
    const filtered = await request(app).get(`/api/admin/reviews?hotelId=${hotelB}`).set(bearer(managerAToken));
    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.items.length, 0);
  });

  it('ADMIN sees reviews across every hotel, including filtering by status and hotel', async () => {
    const list = await request(app).get('/api/admin/reviews').set(bearer(adminToken));
    assert.equal(list.status, 200);
    assert.ok(list.body.pagination.total > 0);

    const filtered = await request(app).get(`/api/admin/reviews?hotelId=${hotelA}&status=PENDING`).set(bearer(adminToken));
    assert.equal(filtered.status, 200);
    assert.ok(filtered.body.items.every((r) => r.hotelId === hotelA && r.status === 'PENDING'));
  });

  it('a CUSTOMER cannot reach the moderation queue or the moderate action at all', async () => {
    assert.equal((await request(app).get('/api/admin/reviews').set(bearer(guestToken))).status, 403);
    assert.equal((await request(app).post('/api/admin/reviews/1/moderate').set(bearer(guestToken)).send({ action: 'APPROVE' })).status, 403);
  });
});
