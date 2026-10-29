import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceComponents, quoteNights, nightsBetween, parseDate, addDays, daysBetween } from '../../src/domain/pricing.js';
import { refundFor, describePolicy } from '../../src/domain/cancellationPolicy.js';
import { occupancyFits, sellableUnits, stayLengthCheck } from '../../src/domain/inventory.js';

const FREE = { is_non_refundable: false, cancellation_deadline_hours: 24, refund_percent: 100 };
const PARTIAL = { is_non_refundable: false, cancellation_deadline_hours: 48, refund_percent: 50 };
const NON_REFUNDABLE = { is_non_refundable: true, cancellation_deadline_hours: null, refund_percent: 0 };

test('price components add up: final = base - discount + tax + fee', () => {
  const c = priceComponents({ baseMinor: 800000, discountPercent: 10, taxPercent: 12, feeMinor: 5000 });
  assert.deepEqual(c, { base: 800000, discount: 80000, tax: 86400, fee: 5000, final: 811400 });
  assert.equal(c.final, c.base - c.discount + c.tax + c.fee);
});

test('discount is taken before tax, and rounding is to the nearest paisa', () => {
  // 333 paise at 10% discount is 33.3 -> 33; taxable 300; 12% of 300 is 36.
  const c = priceComponents({ baseMinor: 333, discountPercent: 10, taxPercent: 12 });
  assert.equal(c.discount, 33);
  assert.equal(c.tax, 36);
  assert.equal(c.final, 333 - 33 + 36);
});

test('half paisa rounds away from zero, matching Postgres ROUND', () => {
  // 50 paise at 1% is exactly 0.5 -> 1.
  assert.equal(priceComponents({ baseMinor: 50, discountPercent: 1 }).discount, 1);
});

test('rejects non-integer or negative base prices', () => {
  assert.throws(() => priceComponents({ baseMinor: 10.5 }));
  assert.throws(() => priceComponents({ baseMinor: -1 }));
});

test('quoteNights multiplies per-room totals by the number of rooms', () => {
  const nights = [
    { base: 800000, discount: 0, tax: 0, fee: 0, final: 800000 },
    { base: 1000000, discount: 0, tax: 0, fee: 0, final: 1000000 },
  ];
  const q = quoteNights(nights, 2);
  assert.equal(q.nights, 2);
  assert.equal(q.subtotal, 3600000);
  assert.equal(q.finalAmount, 3600000);
  assert.equal(q.averagePerNight, 900000);
});

test('nightsBetween excludes the check-out day and crosses month and leap-year boundaries', () => {
  assert.deepEqual(nightsBetween('2028-02-28', '2028-03-02'), ['2028-02-28', '2028-02-29', '2028-03-01']);
  assert.equal(daysBetween('2026-10-10', '2026-10-20'), 10);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('parseDate accepts real calendar dates only', () => {
  assert.equal(parseDate('2026-10-10'), '2026-10-10');
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate('10/10/2026'), null);
});

test('free cancellation refunds in full at and beyond the deadline, and nothing after it', () => {
  assert.equal(refundFor(FREE, { amountMinor: 1000000, hoursBeforeCheckIn: 24 }).refundMinor, 1000000, 'exactly on the deadline');
  assert.equal(refundFor(FREE, { amountMinor: 1000000, hoursBeforeCheckIn: 72 }).refundMinor, 1000000);
  assert.equal(refundFor(FREE, { amountMinor: 1000000, hoursBeforeCheckIn: 23.9 }).refundMinor, 0, 'one moment too late');
});

test('partial refund pays the percentage before the deadline only', () => {
  const before = refundFor(PARTIAL, { amountMinor: 1000000, hoursBeforeCheckIn: 60 });
  assert.equal(before.refundMinor, 500000);
  assert.equal(before.refundPercent, 50);
  assert.equal(refundFor(PARTIAL, { amountMinor: 1000000, hoursBeforeCheckIn: 47 }).refundMinor, 0);
});

test('non-refundable policies refund nothing, however early the cancellation', () => {
  assert.deepEqual(refundFor(NON_REFUNDABLE, { amountMinor: 1000000, hoursBeforeCheckIn: 9000 }), { refundMinor: 0, refundPercent: 0, reason: 'NON_REFUNDABLE' });
  assert.equal(refundFor(null, { amountMinor: 1000, hoursBeforeCheckIn: 999 }).refundMinor, 0, 'no policy is treated as non-refundable');
});

test('refund rounding never invents money', () => {
  // 33% of 1 paisa rounds to 0, not 1.
  const tiny = refundFor({ is_non_refundable: false, cancellation_deadline_hours: 1, refund_percent: 33 }, { amountMinor: 1, hoursBeforeCheckIn: 5 });
  assert.equal(tiny.refundMinor, 0);
});

test('policy descriptions are generated from the structured fields', () => {
  assert.match(describePolicy(FREE), /Free cancellation if cancelled at least 1 day before check-in/);
  assert.match(describePolicy(PARTIAL), /50% refund if cancelled at least 2 days/);
  assert.match(describePolicy(NON_REFUNDABLE), /Non-refundable/);
});

test('occupancy splits guests evenly across rooms and respects per-room limits', () => {
  const limits = { maxAdults: 2, maxChildren: 1, maxOccupancy: 3 };
  assert.equal(occupancyFits({ rooms: 2, adults: 4, children: 2, ...limits }), true, 'two adults and one child each');
  assert.equal(occupancyFits({ rooms: 1, adults: 3, children: 0, ...limits }), false, 'three adults in one room');
  assert.equal(occupancyFits({ rooms: 1, adults: 2, children: 2, ...limits }), false, 'two children exceed the child limit');
  assert.equal(occupancyFits({ rooms: 1, adults: 2, children: 1, ...limits }), true);
});

test('sellable units never go negative, and closed nights sell nothing', () => {
  assert.equal(sellableUnits({ totalUnits: 4, blocked: 1, reserved: 2 }), 1);
  assert.equal(sellableUnits({ totalUnits: 4, blocked: 3, reserved: 3 }), 0);
  assert.equal(sellableUnits({ totalUnits: 4, unitsOverride: 10, reserved: 0 }), 10, 'override replaces the base count');
  assert.equal(sellableUnits({ totalUnits: 4, isClosed: true }), 0);
});

test('stay-length limits take the strictest value across the nights', () => {
  const nights = [{ min_stay: 2, max_stay: null }, { min_stay: 3, max_stay: 5 }];
  assert.deepEqual(stayLengthCheck(nights, 3), { ok: true, minRequired: 3, maxAllowed: 5 });
  assert.equal(stayLengthCheck(nights, 2).ok, false);
  assert.equal(stayLengthCheck(nights, 6).ok, false);
});
