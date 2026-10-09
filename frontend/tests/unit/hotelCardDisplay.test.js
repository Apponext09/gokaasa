import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAmenities } from '../../src/features/search/amenities.js';
import { discountDisplay } from '../../src/features/search/discountDisplay.js';

test('normalizeAmenities dedupes before capping, so a repeated tag never eats a slot twice', () => {
  const result = normalizeAmenities(['WiFi', 'WiFi', 'AC', 'Parking', 'Pool'], 3);
  assert.deepEqual(result.shown, ['WiFi', 'AC', 'Parking']);
  assert.equal(result.moreCount, 1);
});

test('normalizeAmenities reports zero more when everything fits', () => {
  const result = normalizeAmenities(['WiFi', 'AC'], 3);
  assert.deepEqual(result.shown, ['WiFi', 'AC']);
  assert.equal(result.moreCount, 0);
});

test('normalizeAmenities handles an empty or missing list without throwing', () => {
  assert.deepEqual(normalizeAmenities([], 3), { shown: [], moreCount: 0 });
  assert.deepEqual(normalizeAmenities(undefined, 3), { shown: [], moreCount: 0 });
});

test('discountDisplay reports no discount when the offer has none', () => {
  assert.deepEqual(discountDisplay({ baseTotalMinor: 500000, discountTotalMinor: 0, nights: 2 }), {
    hasDiscount: false, originalPerNightMinor: null, discountPercent: null,
  });
  assert.deepEqual(discountDisplay(null), { hasDiscount: false, originalPerNightMinor: null, discountPercent: null });
});

test('discountDisplay derives the per-night original price and percent from the real offer totals', () => {
  // 2 nights, base 10,000/night (2,000,000 minor total), discounted by 400,000 minor (20%).
  const result = discountDisplay({ baseTotalMinor: 2_000_000, discountTotalMinor: 400_000, nights: 2 });
  assert.equal(result.hasDiscount, true);
  assert.equal(result.originalPerNightMinor, 1_000_000);
  assert.equal(result.discountPercent, 20);
});
