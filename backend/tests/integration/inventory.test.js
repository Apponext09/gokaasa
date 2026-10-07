import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';
import { pool } from '../../src/db/pool.js';
import { inventoryService } from '../../src/services/inventory.service.js';
import { addDays } from '../../src/domain/pricing.js';

// Room images are written to a throwaway directory, shared with the Phase 2 storage driver.
const MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'gokaasa-rooms-'));
process.env.MEDIA_DIR = MEDIA_DIR;

const PASSWORD = 'Strong-pass-123';
const TODAY = new Date().toISOString().slice(0, 10);
// Stays are far enough in the future that no test depends on the wall clock.
const D0 = addDays(TODAY, 30);

let app;
let adminToken;
let managerToken;
let customerToken;
let hotelId;
let policies;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const pngBytes = (size = 300) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(size, 1)]);
const jpegBytes = (size = 300) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size, 2)]);

async function loginAs(email) {
  return (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.accessToken;
}

/** A published hotel built through the normal admin path: draft, details, cover image, amenity, publish. */
async function publishedHotel(name) {
  const created = await request(app)
    .post('/api/admin/hotels')
    .set(bearer(adminToken))
    .send({ name, city: 'Pune', countryCode: 'IN' });
  const id = created.body.hotel.id;
  await request(app)
    .patch(`/api/admin/hotels/${id}`)
    .set(bearer(adminToken))
    .send({ description: 'Inventory test hotel', starRating: 4, addressLine: '1 Test Lane', latitude: 18.52, longitude: 73.85 });
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

async function createRoom(hid, overrides = {}) {
  const res = await request(app)
    .post(`/api/admin/hotels/${hid}/room-types`)
    .set(bearer(adminToken))
    .send({
      name: 'Deluxe King Room',
      roomCode: 'DKR',
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

async function setPrice(roomId, planId, dates, basePriceMinor, extra = {}) {
  return request(app)
    .post(`/api/admin/room-types/${roomId}/calendar/bulk`)
    .set(bearer(adminToken))
    .send({ from: dates.from, to: dates.to, ratePlanId: planId, basePriceMinor, ...extra });
}

async function availability(hid, checkIn, checkOut, extra = '') {
  return request(app).get(`/api/hotels/${hid}/availability?checkIn=${checkIn}&checkOut=${checkOut}${extra}`);
}

before(async () => {
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
  await createUserWithRole({ email: 'manager@example.com', password: PASSWORD, roleCode: 'HOTEL_MANAGER' });
  await createUserWithRole({ email: 'guest@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  adminToken = await loginAs('admin@example.com');
  managerToken = await loginAs('manager@example.com');
  customerToken = await loginAs('guest@example.com');
  hotelId = await publishedHotel('Inventory Test Hotel');
  // Hotel managers are now scoped per hotel; assign this test's manager so later tests can act on it.
  await pool.query(`INSERT INTO hotel_managers (user_id, hotel_id) SELECT id, $2 FROM users WHERE email = $1`, ['manager@example.com', hotelId]);
  const list = await request(app).get(`/api/admin/hotels/${hotelId}/cancellation-policies`).set(bearer(adminToken));
  policies = Object.fromEntries(list.body.policies.map((policy) => [policy.code, policy]));
});

after(async () => {
  await closeTestDatabase();
  rmSync(MEDIA_DIR, { recursive: true, force: true });
});

describe('1-3. room types: create, update, archive', () => {
  let roomId;

  it('creates a room type with a normalised code and returns it in the list', async () => {
    roomId = await createRoom(hotelId);
    const list = await request(app).get(`/api/admin/hotels/${hotelId}/room-types`).set(bearer(adminToken));
    const room = list.body.roomTypes.find((item) => item.id === roomId);
    assert.equal(room.roomCode, 'DKR');
    assert.equal(room.status, 'ACTIVE');
    assert.equal(room.totalUnits, 4);
  });

  it('rejects a duplicate room code and duplicate name within the same hotel', async () => {
    const code = await request(app).post(`/api/admin/hotels/${hotelId}/room-types`).set(bearer(adminToken)).send({
      name: 'Another Room', roomCode: 'DKR', category: 'STANDARD', bedCount: 1, maxAdults: 2, maxChildren: 0, maxOccupancy: 2, smoking: 'NON_SMOKING', totalUnits: 1,
    });
    assert.equal(code.status, 409);

    const name = await request(app).post(`/api/admin/hotels/${hotelId}/room-types`).set(bearer(adminToken)).send({
      name: 'deluxe king room', roomCode: 'OTHER', category: 'STANDARD', bedCount: 1, maxAdults: 2, maxChildren: 0, maxOccupancy: 2, smoking: 'NON_SMOKING', totalUnits: 1,
    });
    assert.equal(name.status, 409);
  });

  it('updates capacity and view, and rejects occupancy that contradicts adults and children', async () => {
    // The room allows 2 adults and 1 child, so occupancy 3 is valid and 4 is not.
    const ok = await request(app).patch(`/api/admin/room-types/${roomId}`).set(bearer(adminToken)).send({ view: 'Sea', maxOccupancy: 3 });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.roomType.view, 'Sea');
    assert.equal(ok.body.roomType.maxOccupancy, 3);

    const bad = await request(app).patch(`/api/admin/room-types/${roomId}`).set(bearer(adminToken)).send({ maxOccupancy: 10 });
    assert.equal(bad.status, 422);
  });

  it('archives a room type, keeps it in history, and removes it from customers', async () => {
    const archived = await request(app).post(`/api/admin/room-types/${roomId}/archive`).set(bearer(adminToken));
    assert.equal(archived.status, 200);
    assert.equal(archived.body.roomType.status, 'ARCHIVED');

    const adminList = await request(app).get(`/api/admin/hotels/${hotelId}/room-types`).set(bearer(adminToken));
    assert.equal(adminList.body.roomTypes.some((room) => room.id === roomId), false);
    const withArchived = await request(app).get(`/api/admin/hotels/${hotelId}/room-types?includeArchived=true`).set(bearer(adminToken));
    assert.equal(withArchived.body.roomTypes.some((room) => room.id === roomId), true);

    const res = await availability(hotelId, addDays(D0, 0), addDays(D0, 2));
    assert.equal(res.body.roomTypes.some((room) => room.id === roomId), false);
  });
});

describe('4. room images', () => {
  let roomId;
  let first;
  let second;

  before(async () => {
    roomId = await createRoom(hotelId, { name: 'Image Room', roomCode: 'IMG' });
  });

  it('uploads images under server-generated keys and serves them publicly', async () => {
    const a = await request(app).post(`/api/admin/room-types/${roomId}/images`).set(bearer(adminToken)).attach('image', pngBytes(), { filename: '../evil.png', contentType: 'image/png' });
    assert.equal(a.status, 201);
    assert.match(a.body.image.url, /^\/media\/rooms\/\d+\/[0-9a-f-]{36}\.png$/);
    assert.equal(a.body.image.isCover, false, 'the first upload is not the cover');
    first = a.body.image.id;

    const b = await request(app).post(`/api/admin/room-types/${roomId}/images`).set(bearer(adminToken)).attach('image', jpegBytes(), { filename: 'b.jpg', contentType: 'image/jpeg' });
    assert.equal(b.status, 201);
    second = b.body.image.id;

    const served = await request(app).get(a.body.image.url);
    assert.equal(served.status, 200);
    assert.ok(existsSync(path.join(MEDIA_DIR, a.body.image.url.replace('/media/', ''))));
  });

  it('reorders and sets the cover explicitly', async () => {
    const reordered = await request(app).put(`/api/admin/room-types/${roomId}/images/order`).set(bearer(adminToken)).send({ imageIds: [second, first] });
    assert.equal(reordered.status, 200);
    assert.deepEqual(reordered.body.images.map((image) => image.id), [second, first]);

    const cover = await request(app).post(`/api/admin/room-types/${roomId}/images/${first}/cover`).set(bearer(adminToken));
    assert.equal(cover.status, 200);
    const covers = cover.body.images.filter((image) => image.isCover);
    assert.deepEqual(covers.map((image) => image.id), [first]);
  });

  it('applies the shared upload rules: type, signature and customer authorisation', async () => {
    const gif = await request(app).post(`/api/admin/room-types/${roomId}/images`).set(bearer(adminToken)).attach('image', Buffer.from('GIF89a'), { filename: 'x.gif', contentType: 'image/gif' });
    assert.equal(gif.status, 415);
    const customer = await request(app).post(`/api/admin/room-types/${roomId}/images`).set(bearer(customerToken)).attach('image', pngBytes(), { filename: 'y.png', contentType: 'image/png' });
    assert.equal(customer.status, 403);
  });

  it('deletes an image and its stored file', async () => {
    const detail = await request(app).get(`/api/admin/room-types/${roomId}`).set(bearer(adminToken));
    const target = detail.body.roomType.images.find((image) => image.id === second);
    const diskPath = path.join(MEDIA_DIR, target.url.replace('/media/', ''));
    assert.ok(existsSync(diskPath));
    const res = await request(app).delete(`/api/admin/room-types/${roomId}/images/${second}`).set(bearer(adminToken));
    assert.equal(res.status, 204);
    assert.equal(existsSync(diskPath), false);
  });
});

describe('5-6. rate plans and date-based pricing', () => {
  let roomId;
  let planId;

  before(async () => {
    roomId = await createRoom(hotelId, { name: 'Pricing Room', roomCode: 'PRC', totalUnits: 4 });
  });

  it('creates a rate plan that stores every pricing component', async () => {
    const res = await request(app).post(`/api/admin/room-types/${roomId}/rate-plans`).set(bearer(adminToken)).send({
      code: 'BB',
      name: 'Breakfast Included',
      mealPlan: 'BREAKFAST',
      isRefundable: true,
      cancellationPolicyId: policies.FREE_CANCELLATION.id,
      discountPercent: 10,
      taxPercent: 12,
      feeMinor: 5000,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.ratePlan.mealPlan, 'BREAKFAST');
    assert.equal(res.body.ratePlan.cancellationPolicy.code, 'FREE_CANCELLATION');
    planId = res.body.ratePlan.id;
  });

  it('rejects a non-refundable rate that uses a refundable policy', async () => {
    const res = await request(app).post(`/api/admin/room-types/${roomId}/rate-plans`).set(bearer(adminToken)).send({
      code: 'NR', name: 'Non refundable', mealPlan: 'ROOM_ONLY', isRefundable: false, cancellationPolicyId: policies.FREE_CANCELLATION.id,
    });
    assert.equal(res.status, 422);
  });

  it('creates date-based prices where the stored components add up to the final price', async () => {
    const res = await setPrice(roomId, planId, { from: D0, to: addDays(D0, 2) }, 800000);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const day = res.body.days.find((d) => d.date === D0);
    const rate = day.rates[planId];
    assert.equal(rate.base, 800000);
    assert.equal(rate.discount, 80000);
    assert.equal(rate.tax, 86400);
    assert.equal(rate.fee, 5000);
    assert.equal(rate.final, 800000 - 80000 + 86400 + 5000);
  });

  it('prices different nights differently within one date range', async () => {
    await setPrice(roomId, planId, { from: addDays(D0, 2), to: addDays(D0, 2) }, 1200000);
    const cal = await request(app).get(`/api/admin/room-types/${roomId}/calendar?from=${D0}&to=${addDays(D0, 2)}&ratePlanId=${planId}`).set(bearer(adminToken));
    const finals = cal.body.days.map((d) => d.rates[planId].final);
    assert.equal(finals[0], finals[1]);
    assert.ok(finals[2] > finals[0], 'the third night uses its own price');
  });

  it('recomputes stored components when the plan discount changes', async () => {
    await request(app).patch(`/api/admin/rate-plans/${planId}`).set(bearer(adminToken)).send({ discountPercent: 20 });
    const cal = await request(app).get(`/api/admin/room-types/${roomId}/calendar?from=${D0}&to=${D0}&ratePlanId=${planId}`).set(bearer(adminToken));
    const rate = cal.body.days[0].rates[planId];
    assert.equal(rate.discount, 160000);
    assert.equal(rate.final, 800000 - 160000 + Math.round((800000 - 160000) * 0.12) + 5000);
  });

  it('refuses a price for a rate plan that belongs to another room', async () => {
    const other = await createRoom(hotelId, { name: 'Other Room', roomCode: 'OTH' });
    const res = await setPrice(other, planId, { from: D0, to: D0 }, 500000);
    assert.equal(res.status, 422);
  });
});

describe('7, 13, 14. availability, date-range pricing and multi-room', () => {
  let roomId;
  let planId;

  before(async () => {
    roomId = await createRoom(hotelId, { name: 'Availability Room', roomCode: 'AVL', totalUnits: 4 });
    const plan = await request(app).post(`/api/admin/room-types/${roomId}/rate-plans`).set(bearer(adminToken)).send({
      code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, cancellationPolicyId: policies.PARTIAL_REFUND.id, discountPercent: 0, taxPercent: 0, feeMinor: 0,
    });
    planId = plan.body.ratePlan.id;
    await setPrice(roomId, planId, { from: D0, to: addDays(D0, 3) }, 800000);
  });

  it('returns sellable room types with per-night prices, totals and the cancellation policy', async () => {
    const res = await availability(hotelId, D0, addDays(D0, 2), '&rooms=2&adults=2&children=1');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const room = res.body.roomTypes.find((item) => item.id === roomId);
    assert.equal(room.available, true);
    assert.equal(room.availableRooms, 4);
    const plan = room.ratePlans[0];
    assert.equal(plan.mealPlan, 'ROOM_ONLY');
    assert.equal(plan.nights, 2);
    assert.equal(plan.rooms, 2);
    assert.equal(plan.subtotal, 800000 * 2 * 2);
    assert.equal(plan.finalAmount, 800000 * 4);
    assert.equal(plan.cancellationPolicy.code, 'PARTIAL_REFUND');
    assert.match(plan.cancellationPolicy.description, /50% refund/);
    assert.equal(plan.refundable, true);
  });

  it('never exposes internal counts such as blocked or reserved rooms to customers', async () => {
    const res = await availability(hotelId, D0, addDays(D0, 2));
    const text = JSON.stringify(res.body);
    assert.doesNotMatch(text, /"blocked"|"reserved"|"totalUnits"|"unitsOverride"|"sellable"/);
  });

  it('applies date-range pricing to the quote', async () => {
    await setPrice(roomId, planId, { from: addDays(D0, 1), to: addDays(D0, 1) }, 1000000);
    const res = await availability(hotelId, D0, addDays(D0, 2), '&rooms=1');
    const plan = res.body.roomTypes.find((item) => item.id === roomId).ratePlans[0];
    assert.equal(plan.finalAmount, 800000 + 1000000);
    assert.deepEqual(plan.nightly.map((night) => night.final), [800000, 1000000]);
  });

  it('shows capacity when guests per room exceed the room limit, and sold-out when rooms run out', async () => {
    // Four adults in one room is over the 2-adult limit.
    const overCapacity = await availability(hotelId, D0, addDays(D0, 2), '&rooms=1&adults=4');
    assert.equal(overCapacity.body.roomTypes.find((item) => item.id === roomId).unavailableReason, 'CAPACITY');

    // Five rooms with one adult each fit the occupancy rule, but only four rooms exist.
    const tooMany = await availability(hotelId, D0, addDays(D0, 2), '&rooms=5&adults=5');
    const room = tooMany.body.roomTypes.find((item) => item.id === roomId);
    assert.equal(room.available, false);
    assert.equal(room.unavailableReason, 'SOLD_OUT');
    assert.equal(room.availableRooms, 4);

    const fits = await availability(hotelId, D0, addDays(D0, 2), '&rooms=4&adults=4&children=0');
    assert.equal(fits.body.roomTypes.find((item) => item.id === roomId).available, true);
  });

  it('uses the scarcest night for multi-room availability', async () => {
    await createOverlapHold(roomId, addDays(D0, 1), 3);
    const res = await availability(hotelId, D0, addDays(D0, 2), '&rooms=2&adults=2');
    const room = res.body.roomTypes.find((item) => item.id === roomId);
    assert.equal(room.available, false, 'only one room is left on the second night');
    assert.equal(room.unavailableReason, 'SOLD_OUT');
    assert.equal(room.availableRooms, 1);
  });

  it('enforces stay-length limits', async () => {
    await setPrice(roomId, planId, { from: D0, to: D0 }, 800000, { minStay: 3 });
    const res = await availability(hotelId, D0, addDays(D0, 2));
    assert.equal(res.body.roomTypes.find((item) => item.id === roomId).unavailableReason, 'STAY_LENGTH');
    await setPrice(roomId, planId, { from: D0, to: D0 }, 800000, { minStay: null });
  });

  it('rejects past check-in dates and stays longer than the maximum', async () => {
    const past = await availability(hotelId, addDays(TODAY, -2), TODAY);
    assert.equal(past.status, 422);
    const long = await availability(hotelId, D0, addDays(D0, 45));
    assert.equal(long.status, 422);
  });
});

async function createOverlapHold(roomId, stayDate, quantity) {
  // Used only by the availability tests to fill part of a night, through the same reservation path bookings will use.
  await inventoryService.reserve({ roomTypeId: roomId, checkIn: stayDate, checkOut: addDays(stayDate, 1), rooms: quantity });
}

describe('8. closed inventory cannot be booked', () => {
  let roomId;
  let planId;

  before(async () => {
    roomId = await createRoom(hotelId, { name: 'Closed Room', roomCode: 'CLS', totalUnits: 2 });
    const plan = await request(app).post(`/api/admin/room-types/${roomId}/rate-plans`).set(bearer(adminToken)).send({
      code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, discountPercent: 0, taxPercent: 0, feeMinor: 0,
    });
    planId = plan.body.ratePlan.id;
    await setPrice(roomId, planId, { from: addDays(D0, 10), to: addDays(D0, 12) }, 500000);
  });

  it('marks a closed night unavailable for customers and refuses to reserve it', async () => {
    const close = await request(app).post(`/api/admin/room-types/${roomId}/calendar/bulk`).set(bearer(adminToken)).send({
      from: addDays(D0, 10), to: addDays(D0, 10), isClosed: true,
    });
    assert.equal(close.status, 200);

    const res = await availability(hotelId, addDays(D0, 10), addDays(D0, 11));
    const room = res.body.roomTypes.find((item) => item.id === roomId);
    assert.equal(room.unavailableReason, 'CLOSED');

    await assert.rejects(
      () => inventoryService.reserve({ roomTypeId: roomId, checkIn: addDays(D0, 10), checkOut: addDays(D0, 11), rooms: 1 }),
      (error) => error.status === 409,
    );

    const reopen = await request(app).post(`/api/admin/room-types/${roomId}/calendar/bulk`).set(bearer(adminToken)).send({
      from: addDays(D0, 10), to: addDays(D0, 10), isClosed: false,
    });
    assert.equal(reopen.status, 200);
    const after = await availability(hotelId, addDays(D0, 10), addDays(D0, 11));
    assert.equal(after.body.roomTypes.find((item) => item.id === roomId).available, true);
  });

  it('refuses to block more rooms than are free on a night, so blocks cannot cause overbooking', async () => {
    const res = await request(app).post(`/api/admin/room-types/${roomId}/blocks`).set(bearer(adminToken)).send({
      startDate: addDays(D0, 11), endDate: addDays(D0, 12), quantity: 3, reason: 'MAINTENANCE',
    });
    assert.equal(res.status, 409);

    const ok = await request(app).post(`/api/admin/room-types/${roomId}/blocks`).set(bearer(adminToken)).send({
      startDate: addDays(D0, 11), endDate: addDays(D0, 12), quantity: 1, reason: 'MAINTENANCE', note: 'AC repair',
    });
    assert.equal(ok.status, 201);
    const avail = await availability(hotelId, addDays(D0, 11), addDays(D0, 12));
    assert.equal(avail.body.roomTypes.find((item) => item.id === roomId).availableRooms, 1);
  });
});

describe('9-10. visibility: inactive rooms and draft hotels', () => {
  it('keeps an inactive room type out of customer results but visible to admins', async () => {
    const roomId = await createRoom(hotelId, { name: 'Dormant Room', roomCode: 'DRM', totalUnits: 2 });
    await request(app).patch(`/api/admin/room-types/${roomId}`).set(bearer(adminToken)).send({ status: 'INACTIVE' });

    const pub = await availability(hotelId, addDays(D0, 20), addDays(D0, 21));
    assert.equal(pub.body.roomTypes.some((room) => room.id === roomId), false);

    const admin = await request(app).get(`/api/admin/room-types/${roomId}`).set(bearer(adminToken));
    assert.equal(admin.body.roomType.status, 'INACTIVE');
  });

  it('does not expose rooms of a draft hotel', async () => {
    const draft = await request(app).post('/api/admin/hotels').set(bearer(adminToken)).send({ name: 'Draft Rooms Hotel', city: 'Goa', countryCode: 'IN' });
    const draftId = draft.body.hotel.id;
    await createRoom(draftId, { name: 'Draft Room', roomCode: 'DFT' });

    const res = await availability(draftId, addDays(D0, 20), addDays(D0, 21));
    assert.equal(res.status, 404);
    const byRef = await request(app).get(`/api/hotels/${draftId}`);
    assert.equal(byRef.status, 404);
  });
});

describe('11. only administrators and hotel managers change inventory', () => {
  let roomId;

  before(async () => {
    roomId = await createRoom(hotelId, { name: 'Guarded Room', roomCode: 'GRD', totalUnits: 2 });
  });

  it('blocks customers from every write and from the admin calendar', async () => {
    const create = await request(app).post(`/api/admin/hotels/${hotelId}/room-types`).set(bearer(customerToken)).send({
      name: 'Hack', roomCode: 'HCK', category: 'STANDARD', bedCount: 1, maxAdults: 1, maxChildren: 0, maxOccupancy: 1, smoking: 'NON_SMOKING', totalUnits: 1,
    });
    assert.equal(create.status, 403);

    const bulk = await request(app).post(`/api/admin/room-types/${roomId}/calendar/bulk`).set(bearer(customerToken)).send({ from: D0, to: D0, isClosed: true });
    assert.equal(bulk.status, 403);

    const block = await request(app).post(`/api/admin/room-types/${roomId}/blocks`).set(bearer(customerToken)).send({ startDate: D0, endDate: addDays(D0, 1), quantity: 1, reason: 'OTHER' });
    assert.equal(block.status, 403);

    const calendar = await request(app).get(`/api/admin/room-types/${roomId}/calendar?from=${D0}&to=${D0}`);
    assert.equal(calendar.status, 401);
  });

  it('lets hotel managers manage inventory', async () => {
    const res = await request(app).patch(`/api/admin/room-types/${roomId}`).set(bearer(managerToken)).send({ view: 'Garden' });
    assert.equal(res.status, 200);
  });
});

describe('12. cancellation policies', () => {
  it('provides the standard policies and lets a hotel add its own', async () => {
    const res = await request(app).get(`/api/admin/hotels/${hotelId}/cancellation-policies`).set(bearer(adminToken));
    assert.deepEqual(res.body.policies.map((p) => p.code).sort(), ['FREE_CANCELLATION', 'NON_REFUNDABLE', 'PARTIAL_REFUND']);

    const created = await request(app).post(`/api/admin/hotels/${hotelId}/cancellation-policies`).set(bearer(adminToken)).send({
      code: 'WEEK_FLEX', name: 'Week flexible', isNonRefundable: false, cancellationDeadlineHours: 168, refundPercent: 100,
    });
    assert.equal(created.status, 201);
    assert.match(created.body.policy.summary, /7 day\(s\)/);
  });

  it('refuses incoherent policies', async () => {
    const res = await request(app).post(`/api/admin/hotels/${hotelId}/cancellation-policies`).set(bearer(adminToken)).send({
      code: 'BAD', name: 'Bad policy', isNonRefundable: true, cancellationDeadlineHours: 24, refundPercent: 50,
    });
    assert.equal(res.status, 422);
  });

  it('refuses to archive a policy that rates still use', async () => {
    const res = await request(app).post(`/api/admin/cancellation-policies/${policies.PARTIAL_REFUND.id}/archive`).set(bearer(adminToken));
    assert.equal(res.status, 409);
  });
});

describe('14b. overbooking is prevented under concurrency', () => {
  it('lets only one of two simultaneous reservations for the last rooms succeed', async () => {
    const roomId = await createRoom(hotelId, { name: 'Race Room', roomCode: 'RCE', totalUnits: 4 });
    const checkIn = addDays(D0, 40);
    const checkOut = addDays(D0, 42);

    const attempts = await Promise.allSettled([
      inventoryService.reserve({ roomTypeId: roomId, checkIn, checkOut, rooms: 3 }),
      inventoryService.reserve({ roomTypeId: roomId, checkIn, checkOut, rooms: 3 }),
    ]);
    const fulfilled = attempts.filter((result) => result.status === 'fulfilled');
    const rejected = attempts.filter((result) => result.status === 'rejected');
    assert.equal(fulfilled.length, 1, 'exactly one reservation fits');
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.status, 409);

    const res = await availability(hotelId, checkIn, checkOut, '&rooms=1');
    assert.equal(res.body.roomTypes.find((item) => item.id === roomId).availableRooms, 1);
  });

  it('refuses to archive a room type that has upcoming reservations', async () => {
    const roomId = await createRoom(hotelId, { name: 'Held Room', roomCode: 'HLD', totalUnits: 2 });
    await inventoryService.reserve({ roomTypeId: roomId, checkIn: addDays(D0, 50), checkOut: addDays(D0, 51), rooms: 1 });
    const res = await request(app).post(`/api/admin/room-types/${roomId}/archive`).set(bearer(adminToken));
    assert.equal(res.status, 409);
  });
});

describe('room types: amenities and audit', () => {
  it('stores room amenities and records the change in the audit log', async () => {
    const roomId = await createRoom(hotelId, { name: 'Amenity Room', roomCode: 'AMN', totalUnits: 1 });
    const res = await request(app).put(`/api/admin/room-types/${roomId}/amenities`).set(bearer(adminToken)).send({ codes: ['AC', 'WIFI'] });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.roomType.amenities.map((a) => a.code).sort(), ['AC', 'WIFI']);

    const { rows } = await pool.query(`SELECT action FROM audit_logs WHERE entity = 'room_type' AND entity_id = $1`, [String(roomId)]);
    assert.ok(rows.some((row) => row.action === 'room_type.created'));
    assert.ok(rows.some((row) => row.action === 'room_type.amenities_changed'));
  });
});
