import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOfferLookup,
  daysUntilExpiry,
  discountLabel,
  hasOfferFor,
  hotelQualifiesForOffer,
  offersForHotel,
} from '../../src/features/offers/offerHelpers.js';

function offer(overrides = {}) {
  return { discountType: 'PERCENT', discountValue: 10, hotels: [], destinations: [], ...overrides };
}

test('discountLabel formats percentage and fixed discounts', () => {
  assert.equal(discountLabel(offer({ discountType: 'PERCENT', discountValue: 20 })), '20% OFF');
  assert.equal(discountLabel(offer({ discountType: 'FIXED', discountValue: 1000 })), '₹1,000 OFF');
});

test('daysUntilExpiry counts whole days from a fixed "now", not wall-clock time', () => {
  const now = new Date('2026-01-01T00:00:00Z').getTime();
  assert.equal(daysUntilExpiry('2026-01-04T00:00:00Z', now), 3);
  assert.equal(daysUntilExpiry('2025-12-30T00:00:00Z', now), -2, 'already expired is negative, not clamped');
});

test('an unrestricted offer (empty hotels and destinations) applies to every hotel', () => {
  const o = offer();
  assert.equal(hotelQualifiesForOffer(o, { id: 1, city: 'Goa' }), true);
  assert.equal(hotelQualifiesForOffer(o, { id: 999, city: 'Nowhere' }), true);
});

test('a hotel-restricted offer only applies to the listed hotel ids', () => {
  const o = offer({ hotels: [{ id: 5, name: 'X' }] });
  assert.equal(hotelQualifiesForOffer(o, { id: 5, city: 'Goa' }), true);
  assert.equal(hotelQualifiesForOffer(o, { id: 6, city: 'Goa' }), false);
});

test('a destination-restricted offer matches case-insensitively, and is restrictive when both hotel and city are set', () => {
  const cityOnly = offer({ destinations: ['Goa'] });
  assert.equal(hotelQualifiesForOffer(cityOnly, { id: 1, city: 'goa' }), true);
  assert.equal(hotelQualifiesForOffer(cityOnly, { id: 1, city: 'Jaipur' }), false);

  // Both set: must satisfy BOTH, not just one.
  const both = offer({ hotels: [{ id: 5, name: 'X' }], destinations: ['Goa'] });
  assert.equal(hotelQualifiesForOffer(both, { id: 5, city: 'Goa' }), true);
  assert.equal(hotelQualifiesForOffer(both, { id: 5, city: 'Jaipur' }), false, 'right hotel, wrong city restriction still fails');
});

test('offersForHotel filters a list down to the ones that actually qualify', () => {
  const offers = [offer({ hotels: [{ id: 1, name: 'A' }] }), offer({ hotels: [{ id: 2, name: 'B' }] }), offer()];
  const result = offersForHotel(offers, { id: 1, city: 'Goa' });
  assert.equal(result.length, 2, 'the unrestricted one plus the one naming this hotel');
});

test('buildOfferLookup + hasOfferFor avoid per-hotel API calls: one pass over the list answers every hotel', () => {
  const offers = [offer({ hotels: [{ id: 7, name: 'Only This One' }] })];
  const lookup = buildOfferLookup(offers);
  assert.equal(hasOfferFor(lookup, { id: 7, city: 'Goa' }), true);
  assert.equal(hasOfferFor(lookup, { id: 8, city: 'Goa' }), false);
});

test('an unrestricted offer in the list makes every hotel qualify via the lookup', () => {
  const lookup = buildOfferLookup([offer()]);
  assert.equal(hasOfferFor(lookup, { id: 123, city: 'Anywhere' }), true);
});

test('hasOfferFor is false for a null lookup (still loading), never throws', () => {
  assert.equal(hasOfferFor(null, { id: 1, city: 'Goa' }), false);
});
