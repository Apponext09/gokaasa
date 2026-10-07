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

async function roomWithPlans(hotelId, { name, roomCode, maxAdults = 2, maxChildren = 1, maxOccupancy = 3, units = 4, plans, closedNight }) {
  const policies = await policiesFor(hotelId);
  const room = await request(app).post(`/api/admin/hotels/${hotelId}/room-types`).set(bearer(adminToken)).send({
    name, roomCode, category: 'DELUXE', bedCount: 1, maxAdults, maxChildren, maxOccupancy, smoking: 'NON_SMOKING', totalUnits: units,
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
  if (closedNight) {
    await request(app).post(`/api/admin/room-types/${roomId}/calendar/bulk`).set(bearer(adminToken)).send({ from: closedNight, to: closedNight, isClosed: true });
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

  // Closed on the second night: searchable, but not sellable for these dates.
  ids.closed = await publishedHotel({ name: 'Closed Night Inn', city: 'Mumbai', starRating: 2, amenities: ['WIFI'] });
  await roomWithPlans(ids.closed, {
    name: 'Closed Room', roomCode: 'CR', units: 3, closedNight: addDays(D0, 1),
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

  it('returns nothing for dates with no prices', async () => {
    const far = addDays(D0, 60);
    const res = await search(`checkIn=${far}&checkOut=${addDays(far, 2)}&destination=mumbai`);
    assert.equal(res.body.pagination.total, 0);
  });

  it('excludes a hotel whose room is closed on a night of the stay', async () => {
    const res = await search(`${stayParams}&destination=mumbai&stars=2`);
    assert.equal(res.body.pagination.total, 0, 'closed on the second night means no bookable stay');
  });

  it('rejects past check-in dates', async () => {
    const res = await search(`checkIn=${addDays(TODAY, -3)}&checkOut=${TODAY}`);
    assert.equal(res.status, 422);
  });
});

describe('4. occupancy filtering', () => {
  it('fits three adults only in the family room', async () => {
    const res = await search(`${stayParams}&destination=mumbai&occ=3`);
    assert.deepEqual(idsOf(res), [ids.garden]);
  });

  it('fits children against the room limits', async () => {
    const two = await search(`${stayParams}&destination=mumbai&occ=2-7.12`);
    assert.deepEqual(idsOf(two), [ids.garden], 'two children only fit the family room');
    const one = await search(`${stayParams}&destination=mumbai&occ=2-7`);
    assert.equal(idsOf(one).includes(ids.seaBreeze), true);
  });

  it('treats each room separately and runs out when rooms are sold out', async () => {
    const three = await search(`${stayParams}&destination=mumbai&occ=1|1|1`);
    assert.deepEqual(idsOf(three), [ids.seaBreeze], 'Garden Stay has only two rooms');
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

  it('filters by guest rating only for hotels that have one', async () => {
    assert.deepEqual(idsOf(await search(`${stayParams}&destination=mumbai&guestRating=4.5`)), [ids.seaBreeze]);
  });
});

describe('8-11. sorting, pagination, hotel details and availability', () => {
  it('sorts on the backend by price, rating and stars', async () => {
    const asc = idsOf(await search(`${stayParams}&destination=mumbai&sort=price_asc`));
    assert.deepEqual(asc, [ids.garden, ids.seaBreeze]);
    const desc = idsOf(await search(`${stayParams}&destination=mumbai&sort=price_desc`));
    assert.deepEqual(desc, [ids.seaBreeze, ids.garden]);
    assert.deepEqual(idsOf(await search(`${stayParams}&destination=mumbai&sort=guest_rating`)), [ids.seaBreeze, ids.garden]);
    assert.deepEqual(idsOf(await search(`${stayParams}&destination=mumbai&sort=star_rating`)), [ids.seaBreeze, ids.garden]);
  });

  it('paginates with a true total', async () => {
    const first = await search(`${stayParams}&destination=mumbai&sort=price_asc&limit=1&page=1`);
    assert.equal(first.body.pagination.total, 2);
    assert.equal(first.body.pagination.totalPages, 2);
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

  it('shows an unavailable hotel detail for a hotel with no bookable room on those dates', async () => {
    const far = addDays(D0, 80);
    const res = await request(app).get(`/api/hotels/${ids.seaBreeze}/availability?checkIn=${far}&checkOut=${addDays(far, 1)}&occ=2`);
    assert.equal(res.status, 200);
    assert.equal(res.body.roomTypes.every((room) => !room.available), true);
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
