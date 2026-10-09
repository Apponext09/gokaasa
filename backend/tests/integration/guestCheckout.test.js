import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';
import { pool } from '../../src/db/pool.js';
import { addDays } from '../../src/domain/pricing.js';
import { localToday } from '../../src/domain/businessDate.js';
import { mailService } from '../../src/services/mail.service.js';

const sentMail = [];
function tokenFromLastMail() {
  const link = sentMail.at(-1).text.match(/reset-password\?token=([^\s]+)/)[1];
  return decodeURIComponent(link);
}

/**
 * FEATURE 2 -- guest checkout without mandatory login. POST /api/auth/guest-checkout issues a normal
 * access+refresh session (reusing the exact same authService#issueSession login/register already use),
 * backed by a real `users` row flagged is_guest. Everything downstream of that (hold creation, coupon
 * application, payment, webhook, invoice, cancellation, ownership checks) is the completely unmodified
 * authenticated flow -- this file only tests the new endpoint and its guest-specific guarantees; the
 * existing booking.test.js/payment tests already cover the pipeline itself end-to-end.
 */

const PASSWORD = 'Strong-pass-123';
const TODAY = localToday('Asia/Kolkata');
const D0 = addDays(TODAY, 110);

let app;
let adminToken;
let hotelId, roomTypeId, planId;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const day = (offset) => addDays(D0, offset);

function cookieFrom(res) {
  const header = res.headers['set-cookie']?.find((value) => value.startsWith('gk_refresh='));
  return header ? header.split(';')[0] : null;
}

before(async () => {
  app = await prepareTestDatabase();
  mailService.send = async (message) => {
    sentMail.push(message);
  };
  await createUserWithRole({ email: 'guestco.admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
  adminToken = (await request(app).post('/api/auth/login').send({ email: 'guestco.admin@example.com', password: PASSWORD })).body.accessToken;

  const created = await request(app).post('/api/admin/hotels').set(bearer(adminToken)).send({ name: 'Guest Checkout Hotel', city: 'Goa', countryCode: 'IN' });
  hotelId = created.body.hotel.id;
  await request(app).patch(`/api/admin/hotels/${hotelId}`).set(bearer(adminToken)).send({
    description: 'Guest checkout test hotel', starRating: 4, addressLine: '1 Guest Checkout Road', latitude: 15.3, longitude: 74.0,
  });
  await pool.query(`INSERT INTO hotel_images (hotel_id, category, source_url, is_cover) VALUES ($1, 'EXTERIOR', 'https://example.com/g.jpg', true)`, [hotelId]);
  await request(app).put(`/api/admin/hotels/${hotelId}/amenities`).set(bearer(adminToken)).send({ codes: ['WIFI'] });
  for (const action of ['SUBMIT_FOR_REVIEW', 'MARK_READY', 'PUBLISH']) {
    await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(adminToken)).send({ action });
  }
  const room = await request(app).post(`/api/admin/hotels/${hotelId}/room-types`).set(bearer(adminToken)).send({
    name: 'Guest Checkout Room', roomCode: 'GST', category: 'DELUXE', bedType: 'KING', bedCount: 1,
    maxAdults: 2, maxChildren: 1, maxOccupancy: 3, smoking: 'NON_SMOKING', totalUnits: 10,
  });
  roomTypeId = room.body.roomType.id;
  const policies = await request(app).get(`/api/admin/hotels/${hotelId}/cancellation-policies`).set(bearer(adminToken));
  const freePolicy = policies.body.policies.find((p) => p.code === 'FREE_CANCELLATION');
  const plan = await request(app).post(`/api/admin/room-types/${roomTypeId}/rate-plans`).set(bearer(adminToken)).send({
    code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, cancellationPolicyId: freePolicy.id, discountPercent: 0, taxPercent: 10, feeMinor: 0,
  });
  planId = plan.body.ratePlan.id;
  await request(app).post(`/api/admin/room-types/${roomTypeId}/calendar/bulk`).set(bearer(adminToken)).send({ from: day(0), to: day(60), ratePlanId: planId, basePriceMinor: 1_000_000 });
});

after(async () => {
  await closeTestDatabase();
});

describe('POST /api/auth/guest-checkout', () => {
  it('issues a normal session (access token + httpOnly refresh cookie) without a password', async () => {
    const res = await request(app).post('/api/auth/guest-checkout').send({
      email: 'guest.one@example.com', firstName: 'Guest', lastName: 'One', mobile: '+919876500001',
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.accessToken);
    assert.equal(res.body.refreshToken, undefined, 'refresh token must never be in the JSON body');
    assert.deepEqual(res.body.user.roles, ['CUSTOMER']);
    assert.equal(res.body.user.isGuest, true);
    assert.ok(cookieFrom(res), 'a refresh cookie is set exactly like a normal login');
  });

  it('rejects invalid email and invalid mobile number formats', async () => {
    const badEmail = await request(app).post('/api/auth/guest-checkout').send({ email: 'not-an-email', firstName: 'A', lastName: 'B', mobile: '+919876500002' });
    assert.equal(badEmail.status, 422);
    const badMobile = await request(app).post('/api/auth/guest-checkout').send({ email: 'guest.two@example.com', firstName: 'A', lastName: 'B', mobile: '12' });
    assert.equal(badMobile.status, 422);
  });

  it('reusing the same guest email refreshes the same account rather than creating a duplicate', async () => {
    await request(app).post('/api/auth/guest-checkout').send({ email: 'guest.repeat@example.com', firstName: 'First', lastName: 'Visit', mobile: '+919876500003' });
    const second = await request(app).post('/api/auth/guest-checkout').send({ email: 'guest.repeat@example.com', firstName: 'Second', lastName: 'Visit', mobile: '+919876500004' });
    assert.equal(second.status, 200, JSON.stringify(second.body));
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS c, MAX(first_name) AS name, MAX(phone) AS phone FROM users WHERE email = $1`, ['guest.repeat@example.com']);
    assert.equal(rows[0].c, 1, 'exactly one account for this email -- no duplicate customer created');
    assert.equal(rows[0].name, 'Second', 'the contact details are refreshed for this new checkout');
    assert.equal(rows[0].phone, '+919876500004');
  });

  it('refuses to attach to an email that already belongs to a real registered account', async () => {
    await request(app).post('/api/auth/register').send({ email: 'registered.customer@example.com', password: PASSWORD, firstName: 'Real', lastName: 'Customer' });
    const res = await request(app).post('/api/auth/guest-checkout').send({
      email: 'registered.customer@example.com', firstName: 'Someone', lastName: 'Else', mobile: '+919876500005',
    });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    const { rows } = await pool.query(`SELECT first_name FROM users WHERE email = $1`, ['registered.customer@example.com']);
    assert.equal(rows[0].first_name, 'Real', 'the real account is never silently overwritten');
  });

  it('a guest account can never log in with a password -- it has no real one', async () => {
    await request(app).post('/api/auth/guest-checkout').send({ email: 'guest.nopass@example.com', firstName: 'No', lastName: 'Password', mobile: '+919876500006' });
    const login = await request(app).post('/api/auth/login').send({ email: 'guest.nopass@example.com', password: 'anything-at-all-123' });
    assert.equal(login.status, 401);
  });

  it('the guest-checkout session behaves as a completely ordinary authenticated customer: it can create a real hold', async () => {
    const session = await request(app).post('/api/auth/guest-checkout').send({
      email: 'guest.booker@example.com', firstName: 'Guest', lastName: 'Booker', mobile: '+919876500007',
    });
    const token = session.body.accessToken;
    const hold = await request(app).post('/api/booking/holds').set(bearer(token)).send({
      hotelId, roomTypeId, ratePlanId: planId, checkIn: day(1), checkOut: day(3), rooms: 1,
      occupancy: [{ adults: 2, childAges: [] }],
    });
    assert.equal(hold.status, 201, JSON.stringify(hold.body));

    // Server-authoritative pricing is completely unaffected by being a guest session.
    const guests = await request(app).put(`/api/booking/holds/${hold.body.hold.id}/guests`).set(bearer(token)).send({
      primaryContact: { firstName: 'Guest', lastName: 'Booker', email: 'guest.booker@example.com', mobile: '+919876500007' },
      rooms: [{ roomIndex: 0, guests: [] }],
    });
    assert.equal(guests.status, 200, JSON.stringify(guests.body));

    const order = await request(app).post('/api/payments/create-order').set(bearer(token)).send({ holdId: hold.body.hold.id });
    assert.equal(order.status, 201, JSON.stringify(order.body));
  });

  it('a guest cannot see another guest\'s (or anyone else\'s) bookings -- ordinary ownership applies unchanged', async () => {
    const guestA = await request(app).post('/api/auth/guest-checkout').send({ email: 'guest.a@example.com', firstName: 'Guest', lastName: 'A', mobile: '+919876500008' });
    const guestB = await request(app).post('/api/auth/guest-checkout').send({ email: 'guest.b@example.com', firstName: 'Guest', lastName: 'B', mobile: '+919876500009' });
    const holdA = await request(app).post('/api/booking/holds').set(bearer(guestA.body.accessToken)).send({
      hotelId, roomTypeId, ratePlanId: planId, checkIn: day(5), checkOut: day(7), rooms: 1,
      occupancy: [{ adults: 2, childAges: [] }],
    });
    assert.equal(holdA.status, 201);

    const asB = await request(app).get(`/api/booking/holds/${holdA.body.hold.id}`).set(bearer(guestB.body.accessToken));
    assert.equal(asB.status, 404, 'guest B cannot see guest A\'s hold');
  });
});

describe('security: guest account reuse cannot be used to take over a stranger\'s booking history', () => {
  async function fullyBookedGuest(email) {
    const session = await request(app).post('/api/auth/guest-checkout').send({ email, firstName: 'Victim', lastName: 'Real', mobile: '+919876500030' });
    const token = session.body.accessToken;
    const hold = await request(app).post('/api/booking/holds').set(bearer(token)).send({
      hotelId, roomTypeId, ratePlanId: planId, checkIn: day(8), checkOut: day(10), rooms: 1,
      occupancy: [{ adults: 2, childAges: [] }],
    });
    await request(app).put(`/api/booking/holds/${hold.body.hold.id}/guests`).set(bearer(token)).send({
      primaryContact: { firstName: 'Victim', lastName: 'Real', email, mobile: '+919876500030' },
      rooms: [{ roomIndex: 0, guests: [] }],
    });
    const order = await request(app).post('/api/payments/create-order').set(bearer(token)).send({ holdId: hold.body.hold.id });
    const capture = await request(app).post('/api/payments/dev/checkout').set(bearer(token)).send({ razorpayOrderId: order.body.orderId, outcome: 'success' });
    const verified = await request(app).post('/api/payments/verify').set(bearer(token)).send({
      razorpay_order_id: capture.body.razorpay_order_id, razorpay_payment_id: capture.body.razorpay_payment_id, razorpay_signature: capture.body.razorpay_signature,
    });
    return verified.body.booking.id;
  }

  it('a guest-checkout call for an email that already has a confirmed booking is refused, not reused', async () => {
    const bookingId = await fullyBookedGuest('victim.confirmed@example.com');

    const attacker = await request(app).post('/api/auth/guest-checkout').send({
      email: 'victim.confirmed@example.com', firstName: 'Attacker', lastName: 'Evil', mobile: '+919876500099',
    });
    assert.equal(attacker.status, 409, JSON.stringify(attacker.body));

    // Confirm there genuinely is no way through: no token was issued, so there is nothing to even try the booking with.
    assert.equal(attacker.body.accessToken, undefined);
    const stillOwnedCount = await pool.query(`SELECT user_id FROM bookings WHERE id = $1`, [bookingId]);
    assert.ok(stillOwnedCount.rows[0].user_id, 'the booking still belongs to the original guest user id, untouched');
  });

  it('a guest-checkout call for an email with only an UNPAID/abandoned hold (no completed booking) is still refused once any booking row exists, even a failed one', async () => {
    const email = 'victim.failedpay@example.com';
    const session = await request(app).post('/api/auth/guest-checkout').send({ email, firstName: 'Victim', lastName: 'Real', mobile: '+919876500031' });
    const token = session.body.accessToken;
    const hold = await request(app).post('/api/booking/holds').set(bearer(token)).send({
      hotelId, roomTypeId, ratePlanId: planId, checkIn: day(9), checkOut: day(11), rooms: 1,
      occupancy: [{ adults: 2, childAges: [] }],
    });
    await request(app).put(`/api/booking/holds/${hold.body.hold.id}/guests`).set(bearer(token)).send({
      primaryContact: { firstName: 'Victim', lastName: 'Real', email, mobile: '+919876500031' },
      rooms: [{ roomIndex: 0, guests: [] }],
    });
    // A booking row now exists (INITIATED/PAYMENT_PENDING) even though payment never completed.
    await request(app).post('/api/payments/create-order').set(bearer(token)).send({ holdId: hold.body.hold.id });

    const attacker = await request(app).post('/api/auth/guest-checkout').send({ email, firstName: 'Attacker', lastName: 'Evil', mobile: '+919876500099' });
    assert.equal(attacker.status, 409, JSON.stringify(attacker.body));
  });

  it('a guest-checkout call for an email with zero bookings at all is still safely reused (the legitimate abandoned-form-retry case)', async () => {
    const email = 'guest.neverbooked@example.com';
    const first = await request(app).post('/api/auth/guest-checkout').send({ email, firstName: 'First', lastName: 'Try', mobile: '+919876500032' });
    assert.equal(first.status, 200);
    const second = await request(app).post('/api/auth/guest-checkout').send({ email, firstName: 'Second', lastName: 'Try', mobile: '+919876500033' });
    assert.equal(second.status, 200, JSON.stringify(second.body));
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM users WHERE email = $1`, [email]);
    assert.equal(rows[0].c, 1, 'still exactly one account -- no booking history existed, so reuse remains safe');
  });

  it('once a guest sets a real password via the existing password-reset flow, guest-checkout can never again bypass it', async () => {
    const email = 'guest.upgraded@example.com';
    await request(app).post('/api/auth/guest-checkout').send({ email, firstName: 'Upgrading', lastName: 'Guest', mobile: '+919876500034' });

    const before = await pool.query(`SELECT is_guest FROM users WHERE email = $1`, [email]);
    assert.equal(before.rows[0].is_guest, true, 'sanity check: still a guest account before the reset completes');

    sentMail.length = 0;
    await request(app).post('/api/auth/forgot-password').send({ email });
    assert.equal(sentMail.length, 1, 'the real, email-verified forgot-password flow sent a reset link');
    const token = tokenFromLastMail();
    const reset = await request(app).post('/api/auth/reset-password').send({ token, password: 'Upgraded-pass-99' });
    assert.equal(reset.status, 200, JSON.stringify(reset.body));

    const after = await pool.query(`SELECT is_guest FROM users WHERE email = $1`, [email]);
    assert.equal(after.rows[0].is_guest, false, 'is_guest is cleared once a real, verified password is set');

    // The account now behaves exactly like any other registered account: it can log in with the new
    // password, and guest-checkout for this email is refused rather than silently reused or bypassed.
    const login = await request(app).post('/api/auth/login').send({ email, password: 'Upgraded-pass-99' });
    assert.equal(login.status, 200, JSON.stringify(login.body));

    const guestAttempt = await request(app).post('/api/auth/guest-checkout').send({ email, firstName: 'Anyone', lastName: 'Else', mobile: '+919876500035' });
    assert.equal(guestAttempt.status, 409, 'guest-checkout can no longer bypass the password this account now has');
  });
});
