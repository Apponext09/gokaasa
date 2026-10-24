import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSearchParams,
  toSearchParams,
  parseOccupancy,
  formatOccupancy,
  nightsBetween,
  addDays,
  validateStay,
  slugifyPlace,
  DINNER_INCLUDED_MEAL_PLANS,
  destinationSearchPath,
} from '../../src/features/search/searchParams.js';

test('a shared URL restores the same search after a reload', () => {
  const url = new URLSearchParams('checkIn=2026-10-15&checkOut=2026-10-17&occ=2-7.12|1&sort=price_asc&stars=5,4&amenities=WIFI,POOL&minPrice=5000&maxPrice=15000');
  const state = parseSearchParams(url);
  assert.equal(state.checkIn, '2026-10-15');
  assert.deepEqual(state.occupancy, [{ adults: 2, childAges: [7, 12] }, { adults: 1, childAges: [] }]);
  assert.deepEqual(state.filters.stars, [4, 5]);
  assert.deepEqual(state.filters.amenities, ['WIFI', 'POOL']);
  assert.equal(state.filters.minPrice, 5000);
  const back = toSearchParams(state);
  assert.equal(back.get('occ'), '2-7.12|1');
  assert.equal(back.get('sort'), 'price_asc');
  assert.equal(back.get('stars'), '4,5');
});

test('invalid URL values fall back to safe defaults instead of breaking the page', () => {
  const state = parseSearchParams(new URLSearchParams('checkIn=2026-02-30&occ=9&sort=evil&page=-4&minPrice=900&maxPrice=100&guestRating=2&amenities=wifi'));
  assert.equal(state.checkIn, null);
  assert.deepEqual(state.occupancy, [{ adults: 2, childAges: [] }]);
  assert.equal(state.sort, 'recommended');
  assert.equal(state.page, 1);
  assert.equal(state.filters.minPrice, undefined, 'a reversed price range is dropped');
  assert.equal(state.filters.guestRating, undefined);
  assert.equal(state.filters.amenities, undefined, 'lowercase amenity codes are not valid');
});

test('mealPlans keeps only the dinner-included plans the filter UI can show (half board, full board)', () => {
  const state = parseSearchParams(new URLSearchParams('mealPlans=HALF_BOARD,FULL_BOARD'));
  assert.deepEqual(state.filters.mealPlans, DINNER_INCLUDED_MEAL_PLANS);
});

test('mealPlans drops a stale breakfast/room-only value from an old shared link entirely', () => {
  const state = parseSearchParams(new URLSearchParams('mealPlans=BREAKFAST'));
  assert.equal(state.filters.mealPlans, undefined);
  const mixed = parseSearchParams(new URLSearchParams('mealPlans=BREAKFAST,HALF_BOARD'));
  assert.deepEqual(mixed.filters.mealPlans, ['HALF_BOARD']);
});

test('occupancy round-trips and enforces limits', () => {
  assert.equal(formatOccupancy(parseOccupancy('3|2-0.17')), '3|2-0.17');
  assert.equal(parseOccupancy('0'), null);
  assert.equal(parseOccupancy('2-18'), null);
  assert.equal(parseOccupancy('1|1|1|1|1|1|1|1|1'), null);
});

test('nights are date-only and never negative', () => {
  assert.equal(nightsBetween('2026-10-15', '2026-10-17'), 2);
  assert.equal(nightsBetween('2026-10-17', '2026-10-15'), 0);
  assert.equal(nightsBetween('2026-02-27', '2026-03-01'), 2, 'crosses a non-leap February');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('stay validation explains what is wrong', () => {
  assert.equal(validateStay({ checkIn: '2026-10-15', checkOut: '2026-10-17' }, '2026-10-01'), null);
  assert.match(validateStay({ checkIn: '2026-09-01', checkOut: '2026-09-03' }, '2026-10-01'), /past/);
  assert.match(validateStay({ checkIn: '2026-10-17', checkOut: '2026-10-15' }, '2026-10-01'), /after check-in/);
  assert.match(validateStay({ checkIn: '2026-10-01', checkOut: '2026-12-01' }, '2026-10-01'), /30 nights/);
});

test('place slugs match the server rule for accents and punctuation', () => {
  assert.equal(slugifyPlace('São Paulo'), 'sao-paulo');
  assert.equal(slugifyPlace('Taj Lands End, Mumbai'), 'taj-lands-end-mumbai');
});

test('destination cards link directly to dated hotel results with default occupancy', () => {
  const path = destinationSearchPath('Navi Mumbai', new Date('2026-10-24T08:00:00Z'));
  const [pathname, query] = path.split('?');
  const params = new URLSearchParams(query);
  assert.equal(pathname, '/hotels');
  assert.equal(params.get('destination'), 'navi-mumbai');
  assert.equal(params.get('checkIn'), '2026-10-25');
  assert.equal(params.get('checkOut'), '2026-10-27');
  assert.equal(params.get('occ'), '2');
});
