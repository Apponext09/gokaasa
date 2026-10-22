import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAiCriteria, REAL_AMENITY_CODES, REAL_PROPERTY_TYPES } from '../../src/domain/assistantCriteria.js';

const TODAY = '2026-06-01';

test('a well-formed, fully-specified extraction passes through cleanly', () => {
  const { criteria, missingInformation, problems } = validateAiCriteria(
    {
      destinationQuery: 'Lonavala',
      checkIn: '2026-11-12',
      checkOut: '2026-11-14',
      adults: 4,
      children: [],
      rooms: 2,
      propertyType: 'RESORT',
      rating: null,
      amenities: ['POOL'],
      dinnerIncluded: false,
      freeCancellation: false,
      budget: { amount: 15000, type: 'TOTAL_STAY' },
    },
    { today: TODAY },
  );
  assert.deepEqual(missingInformation, []);
  assert.deepEqual(problems, []);
  assert.equal(criteria.destinationQuery, 'Lonavala');
  assert.equal(criteria.checkIn, '2026-11-12');
  assert.equal(criteria.checkOut, '2026-11-14');
  assert.deepEqual(criteria.occupancy, [{ adults: 2, childAges: [] }, { adults: 2, childAges: [] }]);
  assert.equal(criteria.propertyType, 'RESORT');
  assert.deepEqual(criteria.amenities, ['POOL']);
  assert.deepEqual(criteria.budget, { amount: 15000, type: 'TOTAL_STAY' });
});

test('completely non-object / garbage AI output never crashes and asks for everything', () => {
  for (const bad of [null, undefined, 'not json', 42, ['array', 'not', 'object']]) {
    const result = validateAiCriteria(bad, { today: TODAY });
    assert.deepEqual(result.criteria, {});
    assert.ok(result.missingInformation.includes('destination'));
    assert.ok(result.missingInformation.includes('dates'));
  }
});

test('missing dates are reported as missing, never defaulted', () => {
  const { criteria, missingInformation } = validateAiCriteria({ destinationQuery: 'Goa', adults: 2 }, { today: TODAY });
  assert.equal(criteria.checkIn, undefined);
  assert.ok(missingInformation.includes('dates'));
});

test('a check-in date in the past is rejected, not silently corrected', () => {
  const { criteria, missingInformation, problems } = validateAiCriteria(
    { destinationQuery: 'Goa', checkIn: '2026-01-01', checkOut: '2026-01-03', adults: 2 },
    { today: TODAY },
  );
  assert.equal(criteria.checkIn, undefined);
  assert.ok(missingInformation.includes('dates'));
  assert.ok(problems.some((p) => p.includes('past')));
});

test('a check-out on or before check-in is rejected', () => {
  const { missingInformation } = validateAiCriteria(
    { destinationQuery: 'Goa', checkIn: '2026-11-14', checkOut: '2026-11-12', adults: 2 },
    { today: TODAY },
  );
  assert.ok(missingInformation.includes('dates'));
});

test('a malformed date string (not a real calendar date) is rejected, never guessed at', () => {
  const { criteria, missingInformation } = validateAiCriteria(
    { destinationQuery: 'Goa', checkIn: '2026-13-40', checkOut: '2026-11-14', adults: 2 },
    { today: TODAY },
  );
  assert.equal(criteria.checkIn, undefined);
  assert.ok(missingInformation.includes('dates'));
});

test('a stay longer than the real maximum is rejected', () => {
  const { missingInformation, problems } = validateAiCriteria(
    { destinationQuery: 'Goa', checkIn: '2026-11-01', checkOut: '2026-12-15', adults: 2 },
    { today: TODAY },
  );
  assert.ok(missingInformation.includes('dates'));
  assert.ok(problems.some((p) => p.includes('maximum')));
});

test('a missing or invalid adults count is reported as missing guests', () => {
  assert.ok(validateAiCriteria({ destinationQuery: 'Goa' }, { today: TODAY }).missingInformation.includes('guests'));
  assert.ok(validateAiCriteria({ destinationQuery: 'Goa', adults: 0 }, { today: TODAY }).missingInformation.includes('guests'));
});

test('rooms beyond the real maximum are rejected rather than silently capped', () => {
  const { missingInformation, problems } = validateAiCriteria({ destinationQuery: 'Goa', adults: 4, rooms: 20 }, { today: TODAY });
  assert.ok(missingInformation.includes('guests'));
  assert.ok(problems.some((p) => p.includes('maximum')));
});

test('an invalid child age is rejected rather than coerced', () => {
  const { missingInformation } = validateAiCriteria({ destinationQuery: 'Goa', adults: 2, children: [25] }, { today: TODAY });
  assert.ok(missingInformation.includes('guests'));
});

test('an unsupported property type is dropped with a recorded problem, not invented', () => {
  const { criteria, problems } = validateAiCriteria({ destinationQuery: 'Goa', adults: 2, checkIn: '2026-11-12', checkOut: '2026-11-14', propertyType: 'CASTLE' }, { today: TODAY });
  assert.equal(criteria.propertyType, undefined);
  assert.ok(problems.some((p) => p.includes('CASTLE')));
});

test('"any suitable property" (explicit null) is accepted and distinguished from "not stated"', () => {
  const stated = validateAiCriteria({ destinationQuery: 'Goa', adults: 2, propertyType: null }, { today: TODAY });
  assert.equal(stated.criteria.propertyType, null);
  assert.ok('propertyType' in stated.criteria);

  const notStated = validateAiCriteria({ destinationQuery: 'Goa', adults: 2 }, { today: TODAY });
  assert.ok(!('propertyType' in notStated.criteria));
});

test('every real property type is accepted', () => {
  for (const type of REAL_PROPERTY_TYPES) {
    const { criteria } = validateAiCriteria({ destinationQuery: 'Goa', adults: 2, propertyType: type }, { today: TODAY });
    assert.equal(criteria.propertyType, type);
  }
});

test('an unsupported amenity is silently dropped (not fabricated), real ones still pass', () => {
  const { criteria, problems } = validateAiCriteria({ destinationQuery: 'Goa', adults: 2, amenities: ['POOL', 'HELIPAD', 'WIFI'] }, { today: TODAY });
  assert.deepEqual(criteria.amenities.sort(), ['POOL', 'WIFI']);
  assert.ok(problems.some((p) => p.includes('HELIPAD')));
});

test('every real amenity code is individually accepted', () => {
  for (const code of REAL_AMENITY_CODES) {
    const { criteria } = validateAiCriteria({ destinationQuery: 'Goa', adults: 2, amenities: [code] }, { today: TODAY });
    assert.deepEqual(criteria.amenities, [code]);
  }
});

test('a star rating expands to "that rating and above", matching the guided flow\'s own semantics', () => {
  assert.deepEqual(validateAiCriteria({ destinationQuery: 'Goa', adults: 2, rating: 4 }, { today: TODAY }).criteria.stars, [4, 5]);
  assert.deepEqual(validateAiCriteria({ destinationQuery: 'Goa', adults: 2, rating: 5 }, { today: TODAY }).criteria.stars, [5]);
});

test('an out-of-range rating is rejected rather than clamped', () => {
  const { criteria, problems } = validateAiCriteria({ destinationQuery: 'Goa', adults: 2, rating: 9 }, { today: TODAY });
  assert.equal(criteria.stars, undefined);
  assert.ok(problems.some((p) => p.includes('rating')));
});

test('a budget with a positive amount but no explicit type is rejected -- type is never inferred', () => {
  const { criteria, missingInformation, problems } = validateAiCriteria(
    { destinationQuery: 'Goa', adults: 2, budget: { amount: 5000 } },
    { today: TODAY },
  );
  assert.equal(criteria.budget, undefined);
  assert.ok(missingInformation.includes('budget'));
  assert.ok(problems.some((p) => p.includes('explicit')));
});

test('a non-positive or non-numeric budget amount is rejected', () => {
  for (const amount of [0, -100, 'free', NaN]) {
    const { criteria } = validateAiCriteria({ destinationQuery: 'Goa', adults: 2, budget: { amount, type: 'PER_NIGHT' } }, { today: TODAY });
    assert.equal(criteria.budget, undefined);
  }
});

test('a valid PER_NIGHT and TOTAL_STAY budget both pass through with their explicit type preserved', () => {
  const perNight = validateAiCriteria({ destinationQuery: 'Goa', adults: 2, budget: { amount: 3000, type: 'PER_NIGHT' } }, { today: TODAY });
  assert.deepEqual(perNight.criteria.budget, { amount: 3000, type: 'PER_NIGHT' });
  const total = validateAiCriteria({ destinationQuery: 'Goa', adults: 2, budget: { amount: 15000, type: 'TOTAL_STAY' } }, { today: TODAY });
  assert.deepEqual(total.criteria.budget, { amount: 15000, type: 'TOTAL_STAY' });
});

test('a missing destination is reported as missing, never silently skipped', () => {
  const { missingInformation } = validateAiCriteria({ adults: 2, checkIn: '2026-11-12', checkOut: '2026-11-14' }, { today: TODAY });
  assert.ok(missingInformation.includes('destination'));
});
