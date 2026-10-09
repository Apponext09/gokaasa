import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestDisplayOffer, discountFor, eligibilityErrors } from '../../src/domain/coupon.js';

const PERCENT = { discount_type: 'PERCENT', discount_value: 10, max_discount_minor: null };
const FIXED = { discount_type: 'FIXED', discount_value: 50000, max_discount_minor: null };
const CAPPED_PERCENT = { discount_type: 'PERCENT', discount_value: 50, max_discount_minor: 20000 };

test('a percentage discount is a share of the base amount', () => {
  assert.equal(discountFor(PERCENT, 1_000_000), 100_000);
});

test('a fixed discount is the flat amount, never more than the base', () => {
  assert.equal(discountFor(FIXED, 1_000_000), 50_000);
  assert.equal(discountFor(FIXED, 30_000), 30_000, 'never discounts below zero');
});

test('max_discount_minor caps a percentage discount', () => {
  // 50% of 1,000,000 would be 500,000, but the cap is 20,000.
  assert.equal(discountFor(CAPPED_PERCENT, 1_000_000), 20_000);
});

test('a percentage discount never exceeds the base amount either', () => {
  const hundredPercent = { discount_type: 'PERCENT', discount_value: 100, max_discount_minor: null };
  assert.equal(discountFor(hundredPercent, 42_000), 42_000);
});

function coupon(overrides = {}) {
  return {
    is_active: true,
    valid_from: '2026-01-01T00:00:00Z',
    valid_to: '2026-12-31T23:59:59Z',
    min_amount_minor: 0,
    min_nights: null,
    stay_from: null,
    stay_to: null,
    customer_eligibility: 'ALL',
    ...overrides,
  };
}

function ctx(overrides = {}) {
  return {
    now: new Date('2026-06-01T00:00:00Z'),
    totalMinor: 1_000_000,
    nights: 2,
    checkIn: '2026-07-01',
    checkOut: '2026-07-03',
    isNewCustomer: true,
    hotelAllowed: true,
    destinationAllowed: true,
    usageLimitReached: false,
    perUserLimitReached: false,
    ...overrides,
  };
}

test('an active, in-range, eligible coupon has no errors', () => {
  assert.deepEqual(eligibilityErrors(coupon(), ctx()), []);
});

test('an inactive coupon is rejected', () => {
  assert.ok(eligibilityErrors(coupon({ is_active: false }), ctx()).length > 0);
});

test('a coupon outside its valid_from/valid_to window is rejected', () => {
  assert.ok(eligibilityErrors(coupon(), ctx({ now: new Date('2025-01-01T00:00:00Z') })).length > 0);
  assert.ok(eligibilityErrors(coupon(), ctx({ now: new Date('2027-01-01T00:00:00Z') })).length > 0);
});

test('a usage-limit or per-user-limit reached coupon is rejected', () => {
  assert.ok(eligibilityErrors(coupon(), ctx({ usageLimitReached: true })).length > 0);
  assert.ok(eligibilityErrors(coupon(), ctx({ perUserLimitReached: true })).length > 0);
});

test('a booking below the minimum amount is rejected', () => {
  const errors = eligibilityErrors(coupon({ min_amount_minor: 2_000_000 }), ctx({ totalMinor: 1_000_000 }));
  assert.ok(errors.length > 0);
});

test('a stay shorter than min_nights is rejected', () => {
  assert.ok(eligibilityErrors(coupon({ min_nights: 5 }), ctx({ nights: 2 })).length > 0);
});

test('a stay outside the coupon stay-date window is rejected, inside it is fine', () => {
  const seasonal = coupon({ stay_from: '2026-08-01', stay_to: '2026-08-31' });
  assert.ok(eligibilityErrors(seasonal, ctx({ checkIn: '2026-07-01', checkOut: '2026-07-03' })).length > 0, 'before the window');
  assert.deepEqual(eligibilityErrors(seasonal, ctx({ checkIn: '2026-08-10', checkOut: '2026-08-12' })), []);
});

test('a NEW_CUSTOMERS coupon rejects a returning customer, accepts a new one', () => {
  const newOnly = coupon({ customer_eligibility: 'NEW_CUSTOMERS' });
  assert.ok(eligibilityErrors(newOnly, ctx({ isNewCustomer: false })).length > 0);
  assert.deepEqual(eligibilityErrors(newOnly, ctx({ isNewCustomer: true })), []);
});

test('hotel and destination restrictions are rejected when the resolved flag says they do not match', () => {
  assert.ok(eligibilityErrors(coupon(), ctx({ hotelAllowed: false })).length > 0);
  assert.ok(eligibilityErrors(coupon(), ctx({ destinationAllowed: false })).length > 0);
});

// ---- bestDisplayOffer: the hotel-card discount badge (Feature 1) --------------------------------------

function offer(overrides = {}) {
  return {
    code: 'SAVE15',
    discount_type: 'PERCENT',
    discount_value: 15,
    max_discount_minor: null,
    min_amount_minor: 0,
    min_nights: null,
    stay_from: null,
    stay_to: null,
    customer_eligibility: 'ALL',
    per_user_limit: null,
    hotel_ids: [],
    cities: [],
    ...overrides,
  };
}

const CARD = { subtotalMinor: 1_000_000, hotelId: 7, city: 'Navi Mumbai', nights: 2, checkIn: '2026-07-01', checkOut: '2026-07-03' };

test('a hotel with one active 15% offer shows a 15% badge computed from its own real price', () => {
  const best = bestDisplayOffer([offer({ discount_value: 15 })], CARD);
  assert.deepEqual(best, { code: 'SAVE15', discountMinor: 150_000, discountPercent: 15 });
});

test('a hotel with no offers shows no badge', () => {
  assert.equal(bestDisplayOffer([], CARD), null);
});

test('a hotel-restricted offer only badges the listed hotel', () => {
  const restricted = offer({ hotel_ids: [7] });
  assert.ok(bestDisplayOffer([restricted], CARD));
  assert.equal(bestDisplayOffer([restricted], { ...CARD, hotelId: 99 }), null);
});

test('a destination-restricted offer matches the hotel city case-insensitively', () => {
  const restricted = offer({ cities: ['navi mumbai'] });
  assert.ok(bestDisplayOffer([restricted], CARD));
  assert.equal(bestDisplayOffer([restricted], { ...CARD, city: 'Pune' }), null);
});

test('a fixed-value offer is expressed as a percentage of the real price actually shown, never a fabricated MRP', () => {
  const fixed = offer({ discount_type: 'FIXED', discount_value: 100_000 });
  const best = bestDisplayOffer([fixed], CARD);
  assert.deepEqual(best, { code: 'SAVE15', discountMinor: 100_000, discountPercent: 10 });
});

test('max_discount_minor caps the badge percentage the same way it caps the real discount', () => {
  const capped = offer({ discount_value: 50, max_discount_minor: 50_000 });
  const best = bestDisplayOffer([capped], CARD);
  assert.deepEqual(best, { code: 'SAVE15', discountMinor: 50_000, discountPercent: 5 });
});

test('a card below the offer min_amount_minor shows no badge', () => {
  const pricey = offer({ min_amount_minor: 2_000_000 });
  assert.equal(bestDisplayOffer([pricey], CARD), null);
});

test('min_nights/stay-date offers are skipped entirely when no real stay context is known (a homepage teaser)', () => {
  const nightly = offer({ min_nights: 2 });
  const seasonal = offer({ stay_from: '2026-08-01', stay_to: '2026-08-31' });
  assert.equal(bestDisplayOffer([nightly], { subtotalMinor: 1_000_000, hotelId: 7, city: 'Navi Mumbai' }), null);
  assert.equal(bestDisplayOffer([seasonal], { subtotalMinor: 1_000_000, hotelId: 7, city: 'Navi Mumbai' }), null);
  // The exact same offers DO apply once a real stay is known and satisfies them.
  assert.ok(bestDisplayOffer([nightly], CARD));
});

test('NEW_CUSTOMERS-only and per-user-limited offers never drive the general badge -- checkout still validates them', () => {
  assert.equal(bestDisplayOffer([offer({ customer_eligibility: 'NEW_CUSTOMERS' })], CARD), null);
  assert.equal(bestDisplayOffer([offer({ per_user_limit: 1 })], CARD), null);
});

test('among multiple eligible offers, the one with the highest real discount wins -- never stacked, never ambiguous', () => {
  const small = offer({ code: 'SMALL5', discount_value: 5 });
  const big = offer({ code: 'BIG20', discount_value: 20 });
  assert.deepEqual(bestDisplayOffer([small, big], CARD), { code: 'BIG20', discountMinor: 200_000, discountPercent: 20 });
});

test('a card with no real price (no bookable rate) never shows a fabricated badge', () => {
  assert.equal(bestDisplayOffer([offer()], { ...CARD, subtotalMinor: null }), null);
  assert.equal(bestDisplayOffer([offer()], { ...CARD, subtotalMinor: 0 }), null);
});
