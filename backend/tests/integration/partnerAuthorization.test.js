import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';
import { pool } from '../../src/db/pool.js';
import { createRazorpayGateway } from '../../src/payments/razorpayGateway.js';
import { resetGatewayForTests, setGatewayForTests } from '../../src/payments/index.js';
import { addDays } from '../../src/domain/pricing.js';
import { localToday } from '../../src/domain/businessDate.js';

/**
 * Hotel Partner Portal authorization audit: verifies the backend -- not just the frontend -- rejects
 * every cross-partner / cross-role access attempt. Every assertion here hits a real HTTP endpoint with
 * a real JWT for the role in question; nothing here is a UI-only check.
 */

const PASSWORD = 'Strong-pass-123';
const KEY_SECRET = 'test_key_secret_never_leaves_server';
const TODAY = localToday('Asia/Kolkata');
const CHECK_IN = addDays(TODAY, 40);

let app;
let fake;
let adminToken;
let customerToken;
let managerAToken, managerBToken;
let ownerApprovedToken, ownerPendingToken, ownerRejectedToken;
let hotelA, hotelB, ownerHotel;
let roomA, planA, roomB, planB;
let bookingA, bookingB;
let managerAUserId, managerBUserId, ownerApprovedUserId, ownerPendingUserId, ownerRejectedUserId;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

async function loginAs(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return res.body.accessToken;
}

function fakeRazorpay() {
  const orders = new Map();
  const payments = new Map();
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl = async (url, init = {}) => {
    const { pathname } = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    if (init.method === 'POST' && pathname === '/v1/orders') {
      const id = `order_${crypto.randomBytes(6).toString('hex')}`;
      orders.set(id, { amount: body.amount, currency: body.currency });
      return json(200, { id, amount: body.amount, currency: body.currency, status: 'created' });
    }
    const match = pathname.match(/^\/v1\/payments\/([^/]+)$/);
    if (match && init.method === 'GET') {
      const payment = payments.get(match[1]);
      return payment ? json(200, payment) : json(400, { error: { description: 'The id provided does not exist' } });
    }
    return json(404, { error: { description: 'Not found' } });
  };
  const gateway = createRazorpayGateway({ keyId: 'rzp_test_fakekeyid', keySecret: KEY_SECRET, fetchImpl });
  const pay = ({ orderId, amount }) => {
    const paymentId = `pay_${crypto.randomBytes(6).toString('hex')}`;
    const order = orders.get(orderId);
    payments.set(paymentId, { id: paymentId, order_id: orderId, amount: amount ?? order.amount, currency: 'INR', status: 'captured', method: 'upi' });
    const signature = crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
    return { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature };
  };
  return { gateway, pay };
}

/** Creates a published, bookable hotel (room + rate plan + priced nights) and assigns `managerUserId` to it. */
async function publishedHotelWithManager(name, managerUserId) {
  const created = await request(app).post('/api/admin/hotels').set(bearer(adminToken)).send({ name, city: 'Pune', countryCode: 'IN' });
  const id = created.body.hotel.id;
  await request(app)
    .patch(`/api/admin/hotels/${id}`)
    .set(bearer(adminToken))
    .send({ description: 'Partner audit fixture', starRating: 4, addressLine: '1 Audit Road', latitude: 18.52, longitude: 73.85 });
  await pool.query(`INSERT INTO hotel_images (hotel_id, category, source_url, is_cover) VALUES ($1, 'EXTERIOR', 'https://example.com/h.jpg', true)`, [id]);
  await request(app).put(`/api/admin/hotels/${id}/amenities`).set(bearer(adminToken)).send({ codes: ['WIFI'] });
  await request(app).post(`/api/admin/hotels/${id}/status`).set(bearer(adminToken)).send({ action: 'SUBMIT_FOR_REVIEW' });
  await request(app).post(`/api/admin/hotels/${id}/status`).set(bearer(adminToken)).send({ action: 'MARK_READY' });
  const published = await request(app).post(`/api/admin/hotels/${id}/status`).set(bearer(adminToken)).send({ action: 'PUBLISH' });
  assert.equal(published.status, 200, JSON.stringify(published.body));

  await pool.query(`INSERT INTO hotel_managers (user_id, hotel_id, assigned_by) VALUES ($1, $2, $1)`, [managerUserId, id]);

  const room = await request(app)
    .post(`/api/admin/hotels/${id}/room-types`)
    .set(bearer(adminToken))
    .send({ name: 'Deluxe Room', roomCode: 'DLX', category: 'DELUXE', bedType: 'KING', bedCount: 1, maxAdults: 2, maxChildren: 1, maxOccupancy: 3, smoking: 'NON_SMOKING', totalUnits: 4 });
  assert.equal(room.status, 201, JSON.stringify(room.body));
  const roomId = room.body.roomType.id;

  const policies = await request(app).get(`/api/admin/hotels/${id}/cancellation-policies`).set(bearer(adminToken));
  const freeCancellation = policies.body.policies.find((p) => p.code === 'FREE_CANCELLATION');

  const plan = await request(app)
    .post(`/api/admin/room-types/${roomId}/rate-plans`)
    .set(bearer(adminToken))
    .send({ code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, cancellationPolicyId: freeCancellation.id, discountPercent: 0, taxPercent: 12, feeMinor: 0 });
  assert.equal(plan.status, 201, JSON.stringify(plan.body));
  const planId = plan.body.ratePlan.id;

  const priced = await request(app)
    .post(`/api/admin/room-types/${roomId}/calendar/bulk`)
    .set(bearer(adminToken))
    .send({ from: CHECK_IN, to: addDays(CHECK_IN, 5), ratePlanId: planId, basePriceMinor: 1_000_000 });
  assert.equal(priced.status, 200, JSON.stringify(priced.body));

  return { hotelId: id, roomId, planId };
}

/** Full guest booking flow against one hotel/room/plan, so the fixture includes a real, payment-confirmed booking. */
async function confirmedBookingFor(hotelId, roomId, planId, offsetDays) {
  const checkIn = addDays(CHECK_IN, offsetDays);
  const hold = await request(app)
    .post('/api/booking/holds')
    .set(bearer(customerToken))
    .send({ hotelId, roomTypeId: roomId, ratePlanId: planId, checkIn, checkOut: addDays(checkIn, 1), rooms: 1, occupancy: [{ adults: 2, childAges: [] }] });
  assert.equal(hold.status, 201, JSON.stringify(hold.body));
  const holdId = hold.body.hold.id;

  const guests = await request(app)
    .put(`/api/booking/holds/${holdId}/guests`)
    .set(bearer(customerToken))
    .send({ primaryContact: { firstName: 'Asha', lastName: 'Rao', email: 'audit-guest@example.com', mobile: '+91 98765 43210' }, rooms: [{ roomIndex: 0, guests: [{ firstName: 'Asha', lastName: 'Rao', age: 30 }, { firstName: 'Ravi', lastName: 'Rao', age: 32 }] }] });
  assert.equal(guests.status, 200, JSON.stringify(guests.body));

  const order = await request(app).post('/api/payments/create-order').set(bearer(customerToken)).send({ holdId });
  assert.equal(order.status, 201, JSON.stringify(order.body));

  const payment = fake.pay({ orderId: order.body.orderId, amount: order.body.amount });
  const verified = await request(app).post('/api/payments/verify').set(bearer(customerToken)).send(payment);
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  return verified.body.booking.id;
}

before(async () => {
  app = await prepareTestDatabase();
  fake = fakeRazorpay();
  setGatewayForTests(fake.gateway);

  await createUserWithRole({ email: 'admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
  await createUserWithRole({ email: 'customer@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  managerAUserId = await createUserWithRole({ email: 'manager-a@example.com', password: PASSWORD, roleCode: 'HOTEL_MANAGER' });
  managerBUserId = await createUserWithRole({ email: 'manager-b@example.com', password: PASSWORD, roleCode: 'HOTEL_MANAGER' });
  ownerApprovedUserId = await createUserWithRole({ email: 'owner-approved@example.com', password: PASSWORD, roleCode: 'HOTEL_OWNER' });
  ownerPendingUserId = await createUserWithRole({ email: 'owner-pending@example.com', password: PASSWORD, roleCode: 'HOTEL_OWNER' });
  ownerRejectedUserId = await createUserWithRole({ email: 'owner-rejected@example.com', password: PASSWORD, roleCode: 'HOTEL_OWNER' });

  await pool.query(
    `INSERT INTO partner_profiles (user_id, status, business_name, business_type, contact_phone, property_name, property_city)
     VALUES ($1, 'APPROVED', 'Approved Co', 'INDIVIDUAL', '9000000000', 'Approved Stay', 'Pune'),
            ($2, 'PENDING_REVIEW', 'Pending Co', 'INDIVIDUAL', '9000000001', 'Pending Stay', 'Pune'),
            ($3, 'REJECTED', 'Rejected Co', 'INDIVIDUAL', '9000000002', 'Rejected Stay', 'Pune')`,
    [ownerApprovedUserId, ownerPendingUserId, ownerRejectedUserId],
  );

  adminToken = await loginAs('admin@example.com');
  customerToken = await loginAs('customer@example.com');
  managerAToken = await loginAs('manager-a@example.com');
  managerBToken = await loginAs('manager-b@example.com');
  ownerApprovedToken = await loginAs('owner-approved@example.com');
  ownerPendingToken = await loginAs('owner-pending@example.com');
  ownerRejectedToken = await loginAs('owner-rejected@example.com');

  const a = await publishedHotelWithManager('Partner A Hotel', managerAUserId);
  hotelA = a.hotelId; roomA = a.roomId; planA = a.planId;
  const b = await publishedHotelWithManager('Partner B Hotel', managerBUserId);
  hotelB = b.hotelId; roomB = b.roomId; planB = b.planId;
  const owned = await publishedHotelWithManager('Approved Owner Hotel', ownerApprovedUserId);
  ownerHotel = owned.hotelId;

  bookingA = await confirmedBookingFor(hotelA, roomA, planA, 0);
  bookingB = await confirmedBookingFor(hotelB, roomB, planB, 0);
});

after(async () => {
  resetGatewayForTests();
  await closeTestDatabase();
});

describe('authentication basics', () => {
  it('valid partner (HOTEL_MANAGER) credentials reach the shared admin/partner dashboard surface', async () => {
    const res = await request(app).get('/api/admin/dashboard/summary').set(bearer(managerAToken));
    assert.equal(res.status, 200);
  });

  it('an approved HOTEL_OWNER also reaches the same dashboard surface', async () => {
    const res = await request(app).get('/api/admin/dashboard/summary').set(bearer(ownerApprovedToken));
    assert.equal(res.status, 200);
  });

  it('valid admin credentials open the Admin Dashboard and admin-only APIs', async () => {
    const dashboard = await request(app).get('/api/admin/dashboard/summary').set(bearer(adminToken));
    assert.equal(dashboard.status, 200);
    const users = await request(app).get('/api/admin/users').set(bearer(adminToken));
    assert.equal(users.status, 200);
  });

  it('invalid credentials are rejected', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'manager-a@example.com', password: 'wrong-password' });
    assert.equal(res.status, 401);
  });

  it('an unauthenticated user cannot access protected endpoints', async () => {
    const res = await request(app).get('/api/admin/dashboard/summary');
    assert.equal(res.status, 401);
  });

  it('a customer cannot access partner/admin-only endpoints', async () => {
    const res = await request(app).get('/api/admin/dashboard/summary').set(bearer(customerToken));
    assert.equal(res.status, 403);
  });
});

describe('partner approval gating', () => {
  it('a pending partner cannot reach any admin/partner route, including creating a hotel', async () => {
    const dashboard = await request(app).get('/api/admin/dashboard/summary').set(bearer(ownerPendingToken));
    assert.equal(dashboard.status, 403);
    const create = await request(app).post('/api/admin/hotels').set(bearer(ownerPendingToken)).send({ name: 'Sneaky Hotel', city: 'Pune', countryCode: 'IN' });
    assert.equal(create.status, 403);
  });

  it('a rejected partner cannot reach admin/partner routes either', async () => {
    const res = await request(app).get('/api/admin/dashboard/summary').set(bearer(ownerRejectedToken));
    assert.equal(res.status, 403);
  });

  it("a partner cannot approve another partner, or themselves", async () => {
    const res = await request(app).post(`/api/admin/partners/${ownerPendingUserId}/approve`).set(bearer(ownerApprovedToken));
    assert.equal(res.status, 403);
    const self = await request(app).post(`/api/admin/partners/${ownerApprovedUserId}/approve`).set(bearer(ownerApprovedToken));
    assert.equal(self.status, 403);
  });

  it('an administrator retains the permissions required for legitimate platform management', async () => {
    const approve = await request(app).post(`/api/admin/partners/${ownerPendingUserId}/approve`).set(bearer(adminToken));
    assert.equal(approve.status, 200, JSON.stringify(approve.body));
    // The approval takes effect on this user's NEXT token (roles/status are embedded at issuance) --
    // the same reason a demoted user is not stuck with stale privileges for the life of a refresh token.
    const freshToken = await loginAs('owner-pending@example.com');
    const dashboard = await request(app).get('/api/admin/dashboard/summary').set(bearer(freshToken));
    assert.equal(dashboard.status, 200);
  });
});

describe('admin-only endpoints are rejected for every partner role', () => {
  for (const [label, tokenGetter] of [['HOTEL_MANAGER', () => managerAToken], ['HOTEL_OWNER', () => ownerApprovedToken]]) {
    it(`${label} cannot reach User Management, Audit Logs, Settings (write), Partner review or self-promotion to Manager`, async () => {
      const token = tokenGetter();
      assert.equal((await request(app).get('/api/admin/users').set(bearer(token))).status, 403);
      assert.equal((await request(app).get('/api/admin/audit-logs').set(bearer(token))).status, 403);
      assert.equal((await request(app).patch('/api/admin/settings').set(bearer(token)).send({})).status, 403);
      assert.equal((await request(app).get('/api/admin/partners').set(bearer(token))).status, 403);
      // No endpoint grants a role; the closest thing (assigning a HOTEL_MANAGER to a hotel) is ADMIN-only.
      assert.equal(
        (await request(app).post(`/api/admin/hotels/${hotelA}/managers`).set(bearer(token)).send({ userId: managerAUserId })).status,
        403,
      );
    });
  }
});

describe('cross-partner ownership (IDOR) protection', () => {
  it("Partner A cannot view or modify Partner B's hotel by changing the id", async () => {
    assert.equal((await request(app).get(`/api/admin/hotels/${hotelB}`).set(bearer(managerAToken))).status, 404);
    assert.equal((await request(app).patch(`/api/admin/hotels/${hotelB}`).set(bearer(managerAToken)).send({ name: 'Hijacked' })).status, 404);
    assert.equal((await request(app).put(`/api/admin/hotels/${hotelB}/amenities`).set(bearer(managerAToken)).send({ codes: ['POOL'] })).status, 404);
  });

  it("Partner A cannot modify Partner B's room prices or inventory", async () => {
    assert.equal((await request(app).patch(`/api/admin/room-types/${roomB}`).set(bearer(managerAToken)).send({ name: 'Hijacked Room' })).status, 404);
    assert.equal(
      (await request(app).post(`/api/admin/room-types/${roomB}/calendar/bulk`).set(bearer(managerAToken)).send({ from: CHECK_IN, to: addDays(CHECK_IN, 1), ratePlanId: planB, basePriceMinor: 1 })).status,
      404,
    );
  });

  it("Partner A cannot access Partner B's booking details, and the list endpoint never includes it", async () => {
    assert.equal((await request(app).get(`/api/admin/bookings/${bookingB}`).set(bearer(managerAToken))).status, 404);
    const list = await request(app).get('/api/admin/bookings').set(bearer(managerAToken));
    assert.equal(list.status, 200);
    assert.ok(!list.body.items.some((item) => item.id === bookingB), "Partner A's booking list must never include Partner B's booking");
    assert.ok(list.body.items.some((item) => item.id === bookingA), 'sanity check: Partner A does see its own booking');
  });

  it("Partner A cannot access Partner B's financial records -- scoped queries return nothing, not another partner's data", async () => {
    const summary = await request(app).get('/api/admin/earnings/summary').set(bearer(managerAToken)).query({ hotelId: hotelB });
    assert.equal(summary.status, 200);
    assert.equal(summary.body.grossBookingRevenueMinor, 0, "requesting another partner's hotelId must scope to nothing, not widen to it");

    const ledger = await request(app).get('/api/admin/earnings/ledger').set(bearer(managerAToken)).query({ hotelId: hotelB, page: 1, limit: 20 });
    assert.equal(ledger.status, 200);
    assert.equal(ledger.body.items.length, 0);

    const settlements = await request(app).get('/api/admin/settlements').set(bearer(managerAToken)).query({ hotelId: hotelB });
    assert.equal(settlements.status, 200);
    assert.equal(settlements.body.items.length, 0);

    // Partner A's own hotel, by contrast, does show real figures.
    const own = await request(app).get('/api/admin/earnings/summary').set(bearer(managerAToken)).query({ hotelId: hotelA });
    assert.equal(own.status, 200);
    assert.ok(own.body.grossBookingRevenueMinor > 0, "Partner A's own hotel earnings should be visible and non-zero");
  });

  it("an approved HOTEL_OWNER's hotel list only shows their own hotel, never another partner's", async () => {
    const res = await request(app).get('/api/admin/hotels').set(bearer(ownerApprovedToken));
    assert.equal(res.status, 200);
    const names = res.body.items.map((item) => item.name);
    assert.ok(names.includes('Approved Owner Hotel'));
    assert.ok(!names.includes('Partner A Hotel'));
    assert.ok(!names.includes('Partner B Hotel'));
  });

  it("Partner A's own room-type list never surfaces Partner B's rooms, and vice versa", async () => {
    const listA = await request(app).get(`/api/admin/hotels/${hotelA}/room-types`).set(bearer(managerAToken));
    assert.equal(listA.status, 200);
    assert.ok(listA.body.roomTypes.every((r) => r.id !== roomB));
    assert.equal((await request(app).get(`/api/admin/hotels/${hotelA}/room-types`).set(bearer(managerBToken))).status, 404);
  });
});

describe('existing customer booking functionality is unaffected', () => {
  it('the customer can still view their own confirmed booking after all of the above', async () => {
    const res = await request(app).get(`/api/my-bookings/${bookingA}`).set(bearer(customerToken));
    assert.equal(res.status, 200);
    assert.equal(res.body.booking.status, 'CONFIRMED');
  });

  it('public hotel search still returns the published partner hotels', async () => {
    const res = await request(app).get('/api/hotels/search').query({ checkIn: CHECK_IN, checkOut: addDays(CHECK_IN, 1), occ: '2' });
    assert.equal(res.status, 200);
    const names = res.body.items.map((item) => item.name);
    assert.ok(names.includes('Partner A Hotel'));
    assert.ok(names.includes('Partner B Hotel'));
  });
});
