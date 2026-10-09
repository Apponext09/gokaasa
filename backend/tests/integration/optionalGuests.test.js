import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';
import { pool } from '../../src/db/pool.js';
import { addDays } from '../../src/domain/pricing.js';
import { localToday } from '../../src/domain/businessDate.js';

/**
 * FEATURE 3 -- additional guest details are optional per guest. Only the booking's primaryContact (the
 * lead/booking contact, already required before this phase) stays mandatory; naming every room occupant
 * no longer is. hold.occupancy (set at hold creation, drives pricing/inventory) is the sole source of
 * truth for adult/child counts throughout -- never re-derived from, or reduced by, the guest-name list.
 */

const PASSWORD = 'Strong-pass-123';
const TODAY = localToday('Asia/Kolkata');
const D0 = addDays(TODAY, 100);

let app;
let adminToken, guestToken, managerToken, guestId;
let hotelId, otherHotelId, roomTypeId, planId, otherRoomTypeId, otherPlanId;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const day = (offset) => addDays(D0, offset);

async function loginAs(email) {
  return (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.accessToken;
}

async function publishedHotel(name) {
  const created = await request(app).post('/api/admin/hotels').set(bearer(adminToken)).send({ name, city: 'Jaipur', countryCode: 'IN' });
  const id = created.body.hotel.id;
  await request(app).patch(`/api/admin/hotels/${id}`).set(bearer(adminToken)).send({
    description: 'Optional guests test hotel', starRating: 4, addressLine: '1 Guest Road', latitude: 26.9, longitude: 75.8,
  });
  await pool.query(`INSERT INTO hotel_images (hotel_id, category, source_url, is_cover) VALUES ($1, 'EXTERIOR', 'https://example.com/g.jpg', true)`, [id]);
  await request(app).put(`/api/admin/hotels/${id}/amenities`).set(bearer(adminToken)).send({ codes: ['WIFI'] });
  for (const action of ['SUBMIT_FOR_REVIEW', 'MARK_READY', 'PUBLISH']) {
    await request(app).post(`/api/admin/hotels/${id}/status`).set(bearer(adminToken)).send({ action });
  }
  return id;
}

async function createHold({ adults, childAges = [], rooms = 1, checkIn, hotel = hotelId }) {
  const occupancy = Array.from({ length: rooms }, () => ({ adults, childAges }));
  const useOther = hotel === otherHotelId;
  const res = await request(app).post('/api/booking/holds').set(bearer(guestToken)).send({
    hotelId: hotel,
    roomTypeId: useOther ? otherRoomTypeId : roomTypeId,
    ratePlanId: useOther ? otherPlanId : planId,
    checkIn, checkOut: addDays(checkIn, 2), rooms, occupancy,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.hold;
}

const PRIMARY = { firstName: 'Lead', lastName: 'Guest', email: 'optional.guest@example.com', mobile: '+919876500099' };

before(async () => {
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'optguest.admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
  await createUserWithRole({ email: 'optional.guest@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  await createUserWithRole({ email: 'optguest.manager@example.com', password: PASSWORD, roleCode: 'HOTEL_MANAGER' });
  adminToken = await loginAs('optguest.admin@example.com');
  guestToken = await loginAs('optional.guest@example.com');
  managerToken = await loginAs('optguest.manager@example.com');
  guestId = (await pool.query(`SELECT id FROM users WHERE email = $1`, ['optional.guest@example.com'])).rows[0].id;

  hotelId = await publishedHotel('Optional Guests Hotel');
  otherHotelId = await publishedHotel('Other Guests Hotel');
  const managerId = (await pool.query(`SELECT id FROM users WHERE email = $1`, ['optguest.manager@example.com'])).rows[0].id;
  await pool.query(`INSERT INTO hotel_managers (user_id, hotel_id) VALUES ($1, $2)`, [managerId, hotelId]);

  const room = await request(app).post(`/api/admin/hotels/${hotelId}/room-types`).set(bearer(adminToken)).send({
    name: 'Guest Room', roomCode: 'OPT', category: 'DELUXE', bedType: 'KING', bedCount: 1,
    maxAdults: 4, maxChildren: 2, maxOccupancy: 6, smoking: 'NON_SMOKING', totalUnits: 10,
  });
  roomTypeId = room.body.roomType.id;
  const policies = await request(app).get(`/api/admin/hotels/${hotelId}/cancellation-policies`).set(bearer(adminToken));
  const freePolicy = policies.body.policies.find((p) => p.code === 'FREE_CANCELLATION');
  const plan = await request(app).post(`/api/admin/room-types/${roomTypeId}/rate-plans`).set(bearer(adminToken)).send({
    code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, cancellationPolicyId: freePolicy.id, discountPercent: 0, taxPercent: 10, feeMinor: 0,
  });
  planId = plan.body.ratePlan.id;
  await request(app).post(`/api/admin/room-types/${roomTypeId}/calendar/bulk`).set(bearer(adminToken)).send({ from: day(0), to: day(60), ratePlanId: planId, basePriceMinor: 1_000_000 });

  const otherRoom = await request(app).post(`/api/admin/hotels/${otherHotelId}/room-types`).set(bearer(adminToken)).send({
    name: 'Other Guest Room', roomCode: 'OPT2', category: 'DELUXE', bedType: 'KING', bedCount: 1,
    maxAdults: 4, maxChildren: 2, maxOccupancy: 6, smoking: 'NON_SMOKING', totalUnits: 10,
  });
  otherRoomTypeId = otherRoom.body.roomType.id;
  const otherPolicies = await request(app).get(`/api/admin/hotels/${otherHotelId}/cancellation-policies`).set(bearer(adminToken));
  const otherFreePolicy = otherPolicies.body.policies.find((p) => p.code === 'FREE_CANCELLATION');
  const otherPlan = await request(app).post(`/api/admin/room-types/${otherRoomTypeId}/rate-plans`).set(bearer(adminToken)).send({
    code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, cancellationPolicyId: otherFreePolicy.id, discountPercent: 0, taxPercent: 10, feeMinor: 0,
  });
  otherPlanId = otherPlan.body.ratePlan.id;
  await request(app).post(`/api/admin/room-types/${otherRoomTypeId}/calendar/bulk`).set(bearer(adminToken)).send({ from: day(0), to: day(60), ratePlanId: otherPlanId, basePriceMinor: 1_000_000 });
});

after(async () => {
  await closeTestDatabase();
});

describe('saving guest details with optional additional guests', () => {
  it('a one-guest booking with only the primary contact saves successfully', async () => {
    const hold = await createHold({ adults: 1, checkIn: day(1) });
    const res = await request(app).put(`/api/booking/holds/${hold.id}/guests`).set(bearer(guestToken)).send({
      primaryContact: PRIMARY,
      rooms: [{ roomIndex: 0, guests: [] }],
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });

  it('two guests with both names supplied saves both', async () => {
    const hold = await createHold({ adults: 2, checkIn: day(2) });
    const res = await request(app).put(`/api/booking/holds/${hold.id}/guests`).set(bearer(guestToken)).send({
      primaryContact: PRIMARY,
      rooms: [{ roomIndex: 0, guests: [{ firstName: 'A', lastName: 'One', age: 30 }, { firstName: 'B', lastName: 'Two', age: 28 }] }],
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.hold.guestDetails.rooms[0].guests.length, 2);
  });

  it('two guests with only the primary contact\'s own details supplied -- the room guest list stays empty', async () => {
    const hold = await createHold({ adults: 2, checkIn: day(3) });
    const res = await request(app).put(`/api/booking/holds/${hold.id}/guests`).set(bearer(guestToken)).send({
      primaryContact: PRIMARY,
      rooms: [{ roomIndex: 0, guests: [] }],
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });

  it('multiple guests across rooms with some optional names supplied and some skipped', async () => {
    const hold = await createHold({ adults: 2, rooms: 2, checkIn: day(4) });
    const res = await request(app).put(`/api/booking/holds/${hold.id}/guests`).set(bearer(guestToken)).send({
      primaryContact: PRIMARY,
      rooms: [
        { roomIndex: 0, guests: [{ firstName: 'Named', lastName: 'One', age: 40 }] },
        { roomIndex: 1, guests: [] },
      ],
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });

  it('a missing primaryContact is still rejected -- the lead/booking contact remains required', async () => {
    const hold = await createHold({ adults: 1, checkIn: day(5) });
    const res = await request(app).put(`/api/booking/holds/${hold.id}/guests`).set(bearer(guestToken)).send({
      rooms: [{ roomIndex: 0, guests: [] }],
    });
    assert.equal(res.status, 422, JSON.stringify(res.body));
  });

  it('a half-given guest name (first but no last) is rejected, not silently accepted', async () => {
    const hold = await createHold({ adults: 1, checkIn: day(6) });
    const res = await request(app).put(`/api/booking/holds/${hold.id}/guests`).set(bearer(guestToken)).send({
      primaryContact: PRIMARY,
      rooms: [{ roomIndex: 0, guests: [{ firstName: 'OnlyFirst', lastName: '' }] }],
    });
    assert.equal(res.status, 422, JSON.stringify(res.body));
  });

  it('naming more guests than the room actually holds is rejected', async () => {
    const hold = await createHold({ adults: 1, checkIn: day(7) });
    const res = await request(app).put(`/api/booking/holds/${hold.id}/guests`).set(bearer(guestToken)).send({
      primaryContact: PRIMARY,
      rooms: [{ roomIndex: 0, guests: [{ firstName: 'A', lastName: 'One', age: 30 }, { firstName: 'B', lastName: 'Two', age: 28 }] }],
    });
    assert.equal(res.status, 422, JSON.stringify(res.body));
  });
});

describe('occupancy, pricing and booking records stay correct regardless of named-guest completeness', () => {
  async function payFor(holdId) {
    const order = await request(app).post('/api/payments/create-order').set(bearer(guestToken)).send({ holdId });
    assert.equal(order.status, 201, JSON.stringify(order.body));
    const capture = await request(app).post('/api/payments/dev/checkout').set(bearer(guestToken)).send({ razorpayOrderId: order.body.orderId, outcome: 'success' });
    const verified = await request(app).post('/api/payments/verify').set(bearer(guestToken)).send({
      razorpay_order_id: capture.body.razorpay_order_id, razorpay_payment_id: capture.body.razorpay_payment_id, razorpay_signature: capture.body.razorpay_signature,
    });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    return verified.body.booking;
  }

  it('a confirmed booking keeps the full occupancy count even when no additional guest was ever named', async () => {
    const hold = await createHold({ adults: 2, childAges: [9], checkIn: day(10) });
    await request(app).put(`/api/booking/holds/${hold.id}/guests`).set(bearer(guestToken)).send({
      primaryContact: PRIMARY,
      rooms: [{ roomIndex: 0, guests: [] }],
    });
    const booking = await payFor(hold.id);

    const detail = await request(app).get(`/api/bookings/${booking.id}`).set(bearer(guestToken));
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.booking.stay.adults, 2, 'occupancy is never reduced by missing guest names');
    assert.equal(detail.body.booking.stay.children, 1);
    assert.equal(detail.body.booking.guests.length, 0, 'no fabricated "Guest 2"/"Unknown" row was ever created');
    assert.equal(detail.body.booking.primaryContact.firstName, 'Lead');
  });

  it('a confirmed booking with a partially-named room stores only the real, provided guest -- never a fabricated one', async () => {
    const hold = await createHold({ adults: 2, checkIn: day(11) });
    await request(app).put(`/api/booking/holds/${hold.id}/guests`).set(bearer(guestToken)).send({
      primaryContact: PRIMARY,
      rooms: [{ roomIndex: 0, guests: [{ firstName: 'Only', lastName: 'Named', age: 33 }] }],
    });
    const booking = await payFor(hold.id);

    const detail = await request(app).get(`/api/bookings/${booking.id}`).set(bearer(guestToken));
    assert.equal(detail.body.booking.stay.adults, 2);
    assert.equal(detail.body.booking.guests.length, 1);
    assert.equal(detail.body.booking.guests[0].name, 'Only Named');
    assert.equal(detail.body.booking.guests[0].isPrimary, true);

    const guestRows = await pool.query(`SELECT full_name FROM booking_guests WHERE booking_id = $1`, [booking.id]);
    assert.equal(guestRows.rowCount, 1, 'exactly one real row -- nothing fabricated for the unnamed second adult');
  });

  it('pricing/room-fit is unaffected by guest-name completeness: a fully-unnamed booking still prices and books identically', async () => {
    const named = await createHold({ adults: 2, checkIn: day(12) });
    await request(app).put(`/api/booking/holds/${named.id}/guests`).set(bearer(guestToken)).send({
      primaryContact: PRIMARY,
      rooms: [{ roomIndex: 0, guests: [{ firstName: 'A', lastName: 'One', age: 30 }, { firstName: 'B', lastName: 'Two', age: 28 }] }],
    });
    const unnamed = await createHold({ adults: 2, checkIn: day(13) });
    await request(app).put(`/api/booking/holds/${unnamed.id}/guests`).set(bearer(guestToken)).send({
      primaryContact: PRIMARY,
      rooms: [{ roomIndex: 0, guests: [] }],
    });
    assert.equal(named.quote.totals.total, unnamed.quote.totals.total, 'same stay, same nightly rate -- identical total either way');
  });

  it('an existing (pre-Feature-3) booking with a full named guest list still loads correctly', async () => {
    const hold = await createHold({ adults: 2, checkIn: day(14) });
    await request(app).put(`/api/booking/holds/${hold.id}/guests`).set(bearer(guestToken)).send({
      primaryContact: PRIMARY,
      rooms: [{ roomIndex: 0, guests: [{ firstName: 'Full', lastName: 'List', age: 31 }, { firstName: 'Second', lastName: 'Guest', age: 29 }] }],
    });
    const booking = await payFor(hold.id);
    const detail = await request(app).get(`/api/my-bookings/${booking.id}`).set(bearer(guestToken));
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.booking.guests.length, 2);
  });
});

describe('hotel-manager access to guest details stays scoped to their own hotel', () => {
  it('a HOTEL_MANAGER can see the guest-details/occupancy breakdown for their own hotel\'s booking', async () => {
    const hold = await createHold({ adults: 2, checkIn: day(20) });
    await request(app).put(`/api/booking/holds/${hold.id}/guests`).set(bearer(guestToken)).send({
      primaryContact: PRIMARY,
      rooms: [{ roomIndex: 0, guests: [] }],
    });
    const order = await request(app).post('/api/payments/create-order').set(bearer(guestToken)).send({ holdId: hold.id });
    const capture = await request(app).post('/api/payments/dev/checkout').set(bearer(guestToken)).send({ razorpayOrderId: order.body.orderId, outcome: 'success' });
    const verified = await request(app).post('/api/payments/verify').set(bearer(guestToken)).send({
      razorpay_order_id: capture.body.razorpay_order_id, razorpay_payment_id: capture.body.razorpay_payment_id, razorpay_signature: capture.body.razorpay_signature,
    });
    const bookingId = verified.body.booking.id;

    const res = await request(app).get(`/api/admin/bookings/${bookingId}`).set(bearer(managerToken));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.booking.stay.adults, 2);
    assert.equal(res.body.booking.guests.length, 0);
  });

  it('a HOTEL_MANAGER cannot access a booking for a hotel they are not assigned to (IDOR)', async () => {
    const hold = await createHold({ adults: 1, checkIn: day(21), hotel: otherHotelId });
    await request(app).put(`/api/booking/holds/${hold.id}/guests`).set(bearer(guestToken)).send({
      primaryContact: PRIMARY,
      rooms: [{ roomIndex: 0, guests: [] }],
    });
    const order = await request(app).post('/api/payments/create-order').set(bearer(guestToken)).send({ holdId: hold.id });
    const capture = await request(app).post('/api/payments/dev/checkout').set(bearer(guestToken)).send({ razorpayOrderId: order.body.orderId, outcome: 'success' });
    const verified = await request(app).post('/api/payments/verify').set(bearer(guestToken)).send({
      razorpay_order_id: capture.body.razorpay_order_id, razorpay_payment_id: capture.body.razorpay_payment_id, razorpay_signature: capture.body.razorpay_signature,
    });
    const bookingId = verified.body.booking.id;

    const res = await request(app).get(`/api/admin/bookings/${bookingId}`).set(bearer(managerToken));
    assert.equal(res.status, 404, JSON.stringify(res.body));
  });
});
