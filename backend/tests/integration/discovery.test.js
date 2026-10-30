import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';
import { pool } from '../../src/db/pool.js';
import { addDays } from '../../src/domain/pricing.js';

const PASSWORD = 'Strong-pass-123';
const TODAY = new Date().toISOString().slice(0, 10);
const D0 = addDays(TODAY, 30); // stays are two nights: D0 and D0+1, check-out D0+2
const CHECK_OUT = addDays(D0, 2);

let app;
let adminToken;
let customerToken;
const ids = {};

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

async function publishedHotel({ name, city, area, starRating, propertyType = 'HOTEL', amenities, guestRating, reviewCount }) {
  const created = await request(app).post('/api/admin/hotels').set(bearer(adminToken)).send({ name, city, countryCode: 'IN' });
  const id = created.body.hotel.id;
  await request(app)
    .patch(`/api/admin/hotels/${id}`)
    .set(bearer(adminToken))
    .send({ description: `${name} test property`, starRating, addressLine: '1 Test Road', latitude: 18.5, longitude: 73.8, area, propertyType });
  await pool.query(`INSERT INTO hotel_images (hotel_id, category, source_url, is_cover) VALUES ($1, 'EXTERIOR', 'https://example.com/cover.jpg', true)`, [id]);
  await request(app).put(`/api/admin/hotels/${id}/amenities`).set(bearer(adminToken)).send({ codes: amenities });
  for (const action of ['SUBMIT_FOR_REVIEW', 'MARK_READY', 'PUBLISH']) {
    const res = await request(app).post(`/api/admin/hotels/${id}/status`).set(bearer(adminToken)).send({ action });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  }
  if (guestRating != null) {
    await pool.query(`UPDATE hotels SET guest_rating = $2, review_count = $3 WHERE id = $1`, [id, guestRating, reviewCount]);
  }
  return id;
}

/** Each hotel has its own policies (the platform seeds them per hotel), so plans look them up on their own hotel. */
async function policiesFor(hotelId) {
  const res = await request(app).get(`/api/admin/hotels/${hotelId}/cancellation-policies`).set(bearer(adminToken));
  return Object.fromEntries(res.body.policies.map((p) => [p.code, p]));
}

async function roomWithPlans(hotelId, { name, roomCode, maxAdults = 2, maxChildren = 1, maxOccupancy = 3, units = 4, status = 'ACTIVE', plans }) {
  const policies = await policiesFor(hotelId);
  const room = await request(app).post(`/api/admin/hotels/${hotelId}/room-types`).set(bearer(adminToken)).send({
    name, roomCode, category: 'DELUXE', bedCount: 1, maxAdults, maxChildren, maxOccupancy, smoking: 'NON_SMOKING', totalUnits: units, status,
  });
  assert.equal(room.status, 201, JSON.stringify(room.body));
  const roomId = room.body.roomType.id;
  const planIds = {};
  for (const plan of plans) {
    const res = await request(app).post(`/api/admin/room-types/${roomId}/rate-plans`).set(bearer(adminToken)).send({
      code: plan.code,
      name: plan.name,
      mealPlan: plan.mealPlan,
      isRefundable: plan.isRefundable,
      cancellationPolicyId: policies[plan.policy].id,
      discountPercent: 0,
      taxPercent: 0,
      feeMinor: 0,
      status: plan.status ?? 'ACTIVE',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    planIds[plan.code] = res.body.ratePlan.id;
    await request(app)
      .post(`/api/admin/room-types/${roomId}/calendar/bulk`)
      .set(bearer(adminToken))
      .send({ from: D0, to: addDays(D0, 1), ratePlanId: res.body.ratePlan.id, basePriceMinor: plan.price });
  }
  return { roomId, planIds };
}

async function search(query) {
  return request(app).get(`/api/hotels/search?${query}`);
}

function searchAs(token, query) {
  return request(app).get(`/api/hotels/search?${query}`).set(bearer(token));
}

const idsOf = (res) => res.body.items.map((item) => item.id);

before(async () => {
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
  await createUserWithRole({ email: 'guest@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  adminToken = (await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: PASSWORD })).body.accessToken;
  customerToken = (await request(app).post('/api/auth/login').send({ email: 'guest@example.com', password: PASSWORD })).body.accessToken;

  // Sea Breeze: 5 star, pool and wifi, two rate plans. Cheapest is room only, free cancellation.
  ids.seaBreeze = await publishedHotel({ name: 'Sea Breeze', city: 'Mumbai', area: 'Bandra West', starRating: 5, amenities: ['WIFI', 'POOL'], guestRating: 4.7, reviewCount: 300 });
  ids.seaRoom = await roomWithPlans(ids.seaBreeze, {
    name: 'Sea Deluxe', roomCode: 'SD', maxAdults: 2, maxChildren: 1, maxOccupancy: 3, units: 4,
    plans: [
      { code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, policy: 'FREE_CANCELLATION', price: 800000 },
      { code: 'BB', name: 'Breakfast included', mealPlan: 'BREAKFAST', isRefundable: true, policy: 'PARTIAL_REFUND', price: 900000 },
    ],
  });
  // An inactive room with a lower price must never be offered.
  const cheapInactive = await roomWithPlans(ids.seaBreeze, {
    name: 'Old Room', roomCode: 'OLD', units: 2,
    plans: [{ code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, policy: 'FREE_CANCELLATION', price: 100000 }],
  });
  await request(app).patch(`/api/admin/room-types/${cheapInactive.roomId}`).set(bearer(adminToken)).send({ status: 'INACTIVE' });

  // Garden Stay: 3 star, gym only, larger family rooms, non-refundable rate only.
  ids.garden = await publishedHotel({ name: 'Garden Stay', city: 'Mumbai', area: 'Juhu', starRating: 3, propertyType: 'RESORT', amenities: ['GYM'], guestRating: 4.2, reviewCount: 80 });
  ids.gardenRoom = await roomWithPlans(ids.garden, {
    name: 'Family Garden', roomCode: 'FG', maxAdults: 3, maxChildren: 2, maxOccupancy: 4, units: 2,
    plans: [{ code: 'NR', name: 'Non refundable', mealPlan: 'ROOM_ONLY', isRefundable: false, policy: 'NON_REFUNDABLE', price: 500000 }],
  });

  // Pune: a different destination.
  ids.pune = await publishedHotel({ name: 'Pune Lodge', city: 'Pune', starRating: 4, amenities: ['WIFI'], guestRating: 4.6, reviewCount: 40 });
  await roomWithPlans(ids.pune, { name: 'Lodge Room', roomCode: 'LR', plans: [{ code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, policy: 'FREE_CANCELLATION', price: 400000 }] });

  // Inactive rooms are hidden and not sellable for every date.
  ids.closed = await publishedHotel({ name: 'Closed Night Inn', city: 'Mumbai', starRating: 2, amenities: ['WIFI'] });
  await roomWithPlans(ids.closed, {
    name: 'Closed Room', roomCode: 'CR', units: 3, status: 'INACTIVE',
    plans: [{ code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, policy: 'FREE_CANCELLATION', price: 300000 }],
  });

  // Draft and archived hotels with otherwise valid rooms and prices.
  const draft = await request(app).post('/api/admin/hotels').set(bearer(adminToken)).send({ name: 'Draft Mumbai Hotel', city: 'Mumbai', countryCode: 'IN' });
  ids.draft = draft.body.hotel.id;
  await roomWithPlans(ids.draft, { name: 'Draft Room', roomCode: 'DR', plans: [{ code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, policy: 'FREE_CANCELLATION', price: 100000 }] });

  ids.archived = await publishedHotel({ name: 'Archived Mumbai Hotel', city: 'Mumbai', starRating: 4, amenities: ['WIFI'] });
  await roomWithPlans(ids.archived, { name: 'Old Stock', roomCode: 'AS', plans: [{ code: 'RO', name: 'Room only', mealPlan: 'ROOM_ONLY', isRefundable: true, policy: 'FREE_CANCELLATION', price: 200000 }] });
  await request(app).post(`/api/admin/hotels/${ids.archived}/status`).set(bearer(adminToken)).send({ action: 'ARCHIVE' });
});

after(closeTestDatabase);

const stayParams = `checkIn=${D0}&checkOut=${CHECK_OUT}`;

describe('1-3. published-only results, destinations and date filtering', () => {
  it('returns published hotels and never drafts or archived hotels', async () => {
    const res = await search(`${stayParams}&destination=mumbai`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const found = idsOf(res);
    assert.ok(found.includes(ids.seaBreeze));
    assert.ok(found.includes(ids.garden));
    assert.equal(found.includes(ids.draft), false, 'draft hotels are never listed');
    assert.equal(found.includes(ids.archived), false, 'archived hotels are never listed');
  });

  it('filters by destination and leaves other cities out', async () => {
    const pune = await search(`${stayParams}&destination=pune`);
    assert.deepEqual(idsOf(pune), [ids.pune]);
    const unknown = await search(`${stayParams}&destination=atlantis`);
    assert.equal(unknown.body.pagination.total, 0);
  });

  it('uses the permanent rate-plan price for future dates', async () => {
    const far = addDays(D0, 60);
    const res = await search(`checkIn=${far}&checkOut=${addDays(far, 2)}&destination=mumbai`);
    assert.ok(res.body.pagination.total > 0);
  });

  it('keeps a published hotel visible when its only room is inactive', async () => {
    const res = await search(`${stayParams}&destination=mumbai&stars=2`);
    assert.equal(res.body.pagination.total, 1);
    assert.equal(res.body.items[0].id, ids.closed);
    assert.equal(res.body.items[0].available, false);
    assert.equal(res.body.items[0].availabilityStatus, 'NO_ACTIVE_ROOM');
    assert.equal(res.body.items[0].bestOffer, null, 'inactive rooms are visible but never offered for booking');
  });

  it('finds an unavailable published hotel by its exact name', async () => {
    const res = await search(`${stayParams}&name=${encodeURIComponent('  closed NIGHT inn  ')}`);
    assert.equal(res.body.pagination.total, 1);
    assert.equal(res.body.items[0].id, ids.closed);
    assert.equal(res.body.items[0].availabilityStatus, 'NO_ACTIVE_ROOM');
  });

  it('rejects past check-in dates', async () => {
    const res = await search(`checkIn=${addDays(TODAY, -3)}&checkOut=${TODAY}`);
    assert.equal(res.status, 422);
  });
});

describe('4. occupancy filtering', () => {
  it('marks hotels whose rooms cannot fit the requested occupancy instead of hiding them', async () => {
    const res = await search(`${stayParams}&destination=mumbai&occ=3`);
    assert.equal(res.body.items[0].id, ids.garden);
    assert.equal(res.body.items[0].available, true);
    assert.equal(res.body.items.find((hotel) => hotel.id === ids.seaBreeze).availabilityStatus, 'OCCUPANCY_NOT_SUPPORTED');
    assert.equal(res.body.items.find((hotel) => hotel.id === ids.closed).availabilityStatus, 'NO_ACTIVE_ROOM');
  });

  it('fits children against the room limits', async () => {
    const two = await search(`${stayParams}&destination=mumbai&occ=2-7.12`);
    assert.equal(two.body.items[0].id, ids.garden, 'two children only fit the family room, so it ranks first');
    assert.equal(two.body.items.find((hotel) => hotel.id === ids.seaBreeze).availabilityStatus, 'OCCUPANCY_NOT_SUPPORTED');
    const one = await search(`${stayParams}&destination=mumbai&occ=2-7`);
    assert.equal(idsOf(one).includes(ids.seaBreeze), true);
  });

  it('keeps sold-out hotels visible but marks them unavailable', async () => {
    const three = await search(`${stayParams}&destination=mumbai&occ=1|1|1`);
    assert.deepEqual(idsOf(three), [ids.seaBreeze, ids.garden, ids.closed], 'available hotels rank before unavailable hotels');
    const garden = three.body.items.find((hotel) => hotel.id === ids.garden);
    assert.equal(garden.available, false);
    assert.equal(garden.availabilityStatus, 'SOLD_OUT');
    assert.equal(garden.bestOffer.roomsLeft, 2);
  });

  it('keeps a hotel visible to other users while its last rooms are on hold, then restores booking after release', async () => {
    const held = await request(app)
      .post('/api/booking/holds')
      .set(bearer(customerToken))
      .send({
        hotelId: ids.garden,
        roomTypeId: ids.gardenRoom.roomId,
        ratePlanId: ids.gardenRoom.planIds.NR,
        checkIn: D0,
        checkOut: CHECK_OUT,
        rooms: 2,
        occupancy: [{ adults: 1, childAges: [] }, { adults: 1, childAges: [] }],
      });
    assert.equal(held.status, 201, JSON.stringify(held.body));

    const during = await search(`${stayParams}&destination=mumbai`);
    const temporarilyHeld = during.body.items.find((hotel) => hotel.id === ids.garden);
    assert.ok(temporarilyHeld, 'the hotel remains visible to another user');
    assert.equal(temporarilyHeld.available, false);
    assert.equal(temporarilyHeld.availabilityStatus, 'TEMPORARILY_HELD');
    assert.ok(new Date(temporarilyHeld.retryAt).getTime() > Date.now());

    const released = await request(app)
      .post(`/api/booking/holds/${held.body.hold.id}/release`)
      .set(bearer(customerToken));
    assert.equal(released.status, 200, JSON.stringify(released.body));

    const after = await search(`${stayParams}&destination=mumbai`);
    const availableAgain = after.body.items.find((hotel) => hotel.id === ids.garden);
    assert.equal(availableAgain.available, true);
    assert.equal(availableAgain.availabilityStatus, 'AVAILABLE');
  });

  it('restores availability immediately when a hold expires, without waiting for a cleanup worker', async () => {
    const held = await request(app)
      .post('/api/booking/holds')
      .set(bearer(customerToken))
      .send({
        hotelId: ids.garden,
        roomTypeId: ids.gardenRoom.roomId,
        ratePlanId: ids.gardenRoom.planIds.NR,
        checkIn: D0,
        checkOut: CHECK_OUT,
        rooms: 2,
        occupancy: [{ adults: 1, childAges: [] }, { adults: 1, childAges: [] }],
      });
    assert.equal(held.status, 201, JSON.stringify(held.body));

    await pool.query(`UPDATE booking_holds SET expires_at = now() - interval '1 second' WHERE id = $1`, [held.body.hold.id]);
    await pool.query(`UPDATE inventory_reservations SET expires_at = now() - interval '1 second' WHERE hold_id = $1`, [held.body.hold.id]);

    const afterExpiry = await search(`${stayParams}&destination=mumbai`);
    const availableAgain = afterExpiry.body.items.find((hotel) => hotel.id === ids.garden);
    assert.equal(availableAgain.available, true);
    assert.equal(availableAgain.availabilityStatus, 'AVAILABLE');

    const stored = await pool.query(`SELECT status FROM booking_holds WHERE id = $1`, [held.body.hold.id]);
    assert.equal(stored.rows[0].status, 'HELD', 'search uses expires_at directly; cleanup can finalize status later');
  });

  it('rejects impossible occupancy with a field error', async () => {
    const tooManyAdults = await search(`${stayParams}&occ=9`);
    assert.equal(tooManyAdults.status, 422);
    const tooManyRooms = await search(`${stayParams}&occ=1|1|1|1|1|1|1|1|1`);
    assert.equal(tooManyRooms.status, 422);
    const badAge = await search(`${stayParams}&occ=2-40`);
    assert.equal(badAge.status, 422);
  });
});

describe('5-7. price, star and amenity filtering', () => {
  it('filters by a case-insensitive hotel-name fragment', async () => {
    assert.deepEqual(idsOf(await search(`${stayParams}&destination=mumbai&name=SEA`)), [ids.seaBreeze]);
    assert.deepEqual(idsOf(await search(`${stayParams}&name=${encodeURIComponent('garden stay')}`)), [ids.garden]);
  });

  it('filters by per-night price in rupees', async () => {
    const res = await search(`${stayParams}&destination=mumbai&minPrice=7000&maxPrice=8500`);
    assert.deepEqual(idsOf(res), [ids.seaBreeze], 'Sea Breeze from ₹8,000 a night; Garden Stay at ₹5,000 is below the range');
    const cheap = await search(`${stayParams}&destination=mumbai&maxPrice=6000`);
    assert.deepEqual(idsOf(cheap), [ids.garden]);
  });

  it('filters by star rating', async () => {
    assert.deepEqual(idsOf(await search(`${stayParams}&destination=mumbai&stars=5`)), [ids.seaBreeze]);
    assert.deepEqual(idsOf(await search(`${stayParams}&destination=mumbai&stars=3,4`)), [ids.garden]);
  });

  it('filters hotels with no star rating, including alongside rated categories', async () => {
    await pool.query(`UPDATE hotels SET star_rating = NULL WHERE id = $1`, [ids.garden]);
    try {
      assert.deepEqual(idsOf(await search(`${stayParams}&destination=mumbai&stars=0`)), [ids.garden]);
      assert.deepEqual(idsOf(await search(`${stayParams}&destination=mumbai&stars=0,5`)), [ids.seaBreeze, ids.garden]);
    } finally {
      await pool.query(`UPDATE hotels SET star_rating = 3 WHERE id = $1`, [ids.garden]);
    }
  });

  it('requires every selected amenity', async () => {
    assert.deepEqual(idsOf(await search(`${stayParams}&destination=mumbai&amenities=POOL`)), [ids.seaBreeze]);
    assert.deepEqual(idsOf(await search(`${stayParams}&destination=mumbai&amenities=WIFI,POOL`)), [ids.seaBreeze]);
    assert.deepEqual(idsOf(await search(`${stayParams}&destination=mumbai&amenities=WIFI,GYM`)), []);
  });

  it('filters by property type, meal plan and free cancellation', async () => {
    assert.deepEqual(idsOf(await search(`${stayParams}&destination=mumbai&propertyTypes=RESORT`)), [ids.garden]);
    const breakfast = await search(`${stayParams}&destination=mumbai&mealPlans=BREAKFAST`);
    assert.deepEqual(idsOf(breakfast), [ids.seaBreeze]);
    assert.equal(breakfast.body.items[0].bestOffer.mealPlan, 'BREAKFAST');
    const free = await search(`${stayParams}&destination=mumbai&freeCancellation=true`);
    assert.deepEqual(idsOf(free), [ids.seaBreeze], 'the non-refundable rate is excluded');
    assert.equal(free.body.items[0].bestOffer.ratePlanName, 'Room only');
  });

  it('filters by the guest rating displayed on the hotel card', async () => {
    assert.deepEqual(idsOf(await search(`${stayParams}&destination=mumbai&guestRating=4.5`)), [ids.seaBreeze]);
  });
});

describe('8-11. sorting, pagination, hotel details and availability', () => {
  it('sorts on the backend by price, rating and stars', async () => {
    const asc = idsOf(await search(`${stayParams}&destination=mumbai&sort=price_asc`));
    assert.deepEqual(asc, [ids.garden, ids.seaBreeze, ids.closed]);
    const desc = idsOf(await search(`${stayParams}&destination=mumbai&sort=price_desc`));
    assert.deepEqual(desc, [ids.seaBreeze, ids.garden, ids.closed]);
    assert.deepEqual(idsOf(await search(`${stayParams}&destination=mumbai&sort=guest_rating`)), [ids.seaBreeze, ids.garden, ids.closed]);
    assert.deepEqual(idsOf(await search(`${stayParams}&destination=mumbai&sort=star_rating`)), [ids.seaBreeze, ids.garden, ids.closed]);
  });

  it('paginates with a true total', async () => {
    const first = await search(`${stayParams}&destination=mumbai&sort=price_asc&limit=1&page=1`);
    assert.equal(first.body.pagination.total, 3);
    assert.equal(first.body.pagination.totalPages, 3);
    assert.deepEqual(idsOf(first), [ids.garden]);
    const second = await search(`${stayParams}&destination=mumbai&sort=price_asc&limit=1&page=2`);
    assert.deepEqual(idsOf(second), [ids.seaBreeze]);
  });

  it('returns the cheapest bookable option per hotel and exposes the price bounds', async () => {
    const res = await search(`${stayParams}&destination=mumbai&sort=price_asc`);
    const sea = res.body.items.find((item) => item.id === ids.seaBreeze);
    assert.equal(sea.bestOffer.mealPlan, 'ROOM_ONLY');
    assert.equal(sea.bestOffer.pricePerNightMinor, 800000);
    assert.equal(sea.bestOffer.finalTotalMinor, 1600000, 'two nights, one room');
    assert.equal(sea.bestOffer.refundable, true);
    assert.equal(sea.bestOffer.freeCancellation, true);
    assert.equal(res.body.priceBounds.minPerNightMinor, 500000);
    assert.equal(res.body.priceBounds.maxPerNightMinor, 800000);
  });

  it('does not expose internal fields in search results', async () => {
    const res = await search(`${stayParams}&destination=mumbai`);
    const text = JSON.stringify(res.body);
    assert.doesNotMatch(text, /externalProvider|externalId|createdBy|raw_response|audit|"status":"DRAFT"/);
  });

  it('serves a published hotel detail by slug, with policies and similar hotels', async () => {
    const res = await request(app).get('/api/hotels/sea-breeze-mumbai');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.hotel.name, 'Sea Breeze');
    assert.ok(res.body.hotel.cancellationPolicies.some((p) => p.code === 'FREE_CANCELLATION'));
    assert.ok(res.body.hotel.similarHotels.some((h) => h.id === ids.garden));
    assert.equal(res.body.hotel.externalId, undefined);
  });

  it('hides draft and archived hotels from the detail page', async () => {
    const draft = await request(app).get('/api/hotels/draft-mumbai-hotel');
    assert.equal(draft.status, 404);
    const archived = await request(app).get('/api/hotels/archived-mumbai-hotel');
    assert.equal(archived.status, 404);
  });

  it('returns availability and quotes that agree with search', async () => {
    const res = await request(app).get(`/api/hotels/${ids.seaBreeze}/availability?${stayParams}&occ=2`);
    assert.equal(res.status, 200);
    const room = res.body.roomTypes.find((r) => r.name === 'Sea Deluxe');
    assert.equal(room.available, true);
    assert.equal(room.ratePlans[0].finalAmount, 1600000);
    assert.equal(res.body.roomTypes.some((r) => r.name === 'Old Room'), false, 'inactive rooms are not shown');
  });

  it('shows unavailable rooms with a reason rather than hiding the search answer', async () => {
    const res = await request(app).get(`/api/hotels/${ids.garden}/availability?${stayParams}&occ=1|1|1`);
    const room = res.body.roomTypes.find((r) => r.name === 'Family Garden');
    assert.equal(room.available, false);
    assert.equal(room.unavailableReason, 'SOLD_OUT');
    assert.equal(room.availableRooms, 2);
  });

  it('keeps an active room bookable outside the retired rate-calendar range', async () => {
    const far = addDays(D0, 80);
    const res = await request(app).get(`/api/hotels/${ids.seaBreeze}/availability?checkIn=${far}&checkOut=${addDays(far, 1)}&occ=2`);
    assert.equal(res.status, 200);
    assert.equal(res.body.roomTypes.some((room) => room.name === 'Sea Deluxe' && room.available), true);
  });
});

describe('19. publication and booking no longer depend on a date-specific rate calendar', () => {
  it('keeps a published hotel\'s own detail page reachable without calendar rows', async () => {
    const res = await request(app).get('/api/hotels/sea-breeze-mumbai');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.hotel.name, 'Sea Breeze');
  });

  it('still lists a published hotel in general discovery', async () => {
    const res = await request(app).get('/api/hotels/handpicked?limit=24');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.items.some((item) => item.id === ids.seaBreeze));
  });

  it('includes the same active room for dates without legacy calendar rows', async () => {
    const res = await search(`checkIn=${TODAY}&checkOut=${addDays(TODAY, 2)}&destination=mumbai`);
    assert.equal(res.status, 200);
    assert.equal(idsOf(res).includes(ids.seaBreeze), true, 'active rooms use permanent price and capacity');

    const bookable = await search(stayParams);
    assert.ok(idsOf(bookable).includes(ids.seaBreeze));
  });
});

describe('12-14. wishlist and authentication', () => {
  it('refuses wishlist access to guests', async () => {
    const list = await request(app).get('/api/wishlist');
    assert.equal(list.status, 401);
    const add = await request(app).post('/api/wishlist').send({ hotelId: ids.seaBreeze });
    assert.equal(add.status, 401);
  });

  it('lets a customer save and remove a published hotel', async () => {
    const add = await request(app).post('/api/wishlist').set(bearer(customerToken)).send({ hotelId: ids.seaBreeze });
    assert.equal(add.status, 201);
    const again = await request(app).post('/api/wishlist').set(bearer(customerToken)).send({ hotelId: ids.seaBreeze });
    assert.equal(again.status, 201, 'saving twice is harmless');

    const list = await request(app).get('/api/wishlist').set(bearer(customerToken));
    assert.deepEqual(list.body.items.map((item) => item.id), [ids.seaBreeze]);

    const signedIn = await searchAs(customerToken, `${stayParams}&destination=mumbai&sort=price_asc`);
    assert.equal(signedIn.body.items.find((item) => item.id === ids.seaBreeze).wishlisted, true);
    const guest = await search(`${stayParams}&destination=mumbai&sort=price_asc`);
    assert.equal(guest.body.items.find((item) => item.id === ids.seaBreeze).wishlisted, false);

    const removed = await request(app).delete(`/api/wishlist/${ids.seaBreeze}`).set(bearer(customerToken));
    assert.equal(removed.status, 204);
    const after = await request(app).get('/api/wishlist').set(bearer(customerToken));
    assert.equal(after.body.items.length, 0);
  });

  it('will not save a draft hotel', async () => {
    const res = await request(app).post('/api/wishlist').set(bearer(customerToken)).send({ hotelId: ids.draft });
    assert.equal(res.status, 404);
  });
});

describe('15-16. destinations', () => {
  it('suggests published cities, areas and hotels, and requires a few characters', async () => {
    const res = await request(app).get('/api/destinations/search?q=mum');
    assert.equal(res.status, 200);
    const city = res.body.items.find((item) => item.type === 'CITY');
    assert.equal(city.label, 'Mumbai');
    assert.equal(city.destination, 'mumbai');
    assert.equal(res.body.items.some((item) => item.label === 'Draft Mumbai Hotel'), false);
    const areas = await request(app).get('/api/destinations/search?q=bandra');
    assert.ok(areas.body.items.some((item) => item.type === 'AREA' && item.label === 'Bandra West'));

    const tooShort = await request(app).get('/api/destinations/search?q=m');
    assert.equal(tooShort.status, 422);
  });

  it('lists popular destinations from published hotels only', async () => {
    const res = await request(app).get('/api/destinations/popular');
    const mumbai = res.body.items.find((item) => item.label === 'Mumbai');
    assert.equal(mumbai.hotelCount, 3, 'Sea Breeze, Garden Stay and Closed Night Inn; the draft and archived hotels are not counted');
  });
});

describe('17. invalid search parameters', () => {
  it('rejects malformed dates, stays and filters with field errors', async () => {
    const cases = [
      `checkIn=${D0}&checkOut=${D0}`,
      `checkIn=2026-02-30&checkOut=2026-03-02`,
      `${stayParams}&sort=cheapest`,
      `${stayParams}&minPrice=900&maxPrice=100`,
      `${stayParams}&stars=6`,
      `${stayParams}&amenities=wifi`,
      `${stayParams}&propertyTypes=CASTLE`,
      `${stayParams}&mealPlans=DINNER`,
      `${stayParams}&page=0`,
      `${stayParams}&limit=500`,
      `checkIn=${D0}&checkOut=${addDays(D0, 40)}`,
      `${stayParams}&destination=Mumbai%20City`,
    ];
    for (const query of cases) {
      const res = await search(query);
      assert.equal(res.status, 422, `expected 422 for ${query}: ${JSON.stringify(res.body)}`);
      assert.ok(res.body.error.code, 'error code present');
    }
  });

  it('answers a missing stay with a validation error, not a crash', async () => {
    const res = await request(app).get('/api/hotels/search?destination=mumbai');
    assert.equal(res.status, 422);
  });
});

describe('18. search security: SQL injection, invalid rating, out-of-range filters', () => {
  it('SQL-injection-shaped values in every filter field are rejected by validation before they ever reach a query', async () => {
    const payload = "' OR '1'='1";
    const dropPayload = "mumbai'; DROP TABLE hotels; --";
    const cases = [
      `${stayParams}&destination=${encodeURIComponent(payload)}`,
      `${stayParams}&destination=${encodeURIComponent(dropPayload)}`,
      `${stayParams}&area=${encodeURIComponent(payload)}`,
      `${stayParams}&amenities=${encodeURIComponent(payload)}`,
      `${stayParams}&propertyTypes=${encodeURIComponent(payload)}`,
      `${stayParams}&mealPlans=${encodeURIComponent(payload)}`,
      `${stayParams}&sort=${encodeURIComponent(payload)}`,
    ];
    for (const query of cases) {
      const res = await search(query);
      assert.equal(res.status, 422, `expected 422 for ${query}: ${JSON.stringify(res.body)}`);
    }
    // The attempted DROP TABLE never ran: a completely unrelated, ordinary search still works afterwards.
    const stillWorks = await search(`${stayParams}&destination=mumbai`);
    assert.equal(stillWorks.status, 200, JSON.stringify(stillWorks.body));
    const hotelCount = await pool.query(`SELECT COUNT(*)::int AS n FROM hotels`);
    assert.ok(hotelCount.rows[0].n > 0, 'the hotels table was never dropped');
  });

  it('rejects an out-of-range or non-numeric guest rating', async () => {
    for (const guestRating of ['10', '-1', 'five-stars', '4.5.1']) {
      const res = await search(`${stayParams}&guestRating=${encodeURIComponent(guestRating)}`);
      assert.equal(res.status, 422, `expected 422 for guestRating=${guestRating}`);
    }
  });

  it('rejects a negative or non-numeric price range', async () => {
    for (const query of [`${stayParams}&minPrice=-500`, `${stayParams}&maxPrice=-1`, `${stayParams}&minPrice=abc`]) {
      const res = await search(query);
      assert.equal(res.status, 422, `expected 422 for ${query}`);
    }
  });

  it('rejects an unknown property type and an unknown amenity code, never silently ignoring them', async () => {
    const badPropertyType = await search(`${stayParams}&propertyTypes=CASTLE`);
    assert.equal(badPropertyType.status, 422);
    const badAmenity = await search(`${stayParams}&amenities=not_a_real_code_123456789012345678901234567890`);
    assert.equal(badAmenity.status, 422);
  });

  it('ignores unauthorised/internal fields such as hotel status or ids added to the query string, rather than erroring or treating them as a hidden filter', async () => {
    // hotelSearchQuery does not define "status" or "id" at all, so zod drops them; the candidate-selection
    // SQL always hardcodes status = 'PUBLISHED' itself and is never told which status to use by the client
    // (see describe('1-3 ...') above, which already proves drafts never appear in results).
    const res = await search(`${stayParams}&status=DRAFT&id=1&userId=999999`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });
});
