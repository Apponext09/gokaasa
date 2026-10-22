import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_COMPARE,
  STEP,
  firstIncompleteStep,
  initialAssistantState,
  isStepComplete,
  mergeExtractedCriteria,
  nextStep,
  previousStep,
  toSearchState,
  toggleCompare,
  totalBudgetToPerNightMax,
} from '../../src/features/support/assistantState.js';

test('initial state starts at the greeting with no property type chosen yet', () => {
  const state = initialAssistantState();
  assert.equal(state.step, STEP.GREETING);
  assert.equal(state.propertyType, undefined);
});

test('nextStep/previousStep walk the fixed step order and clamp at the ends', () => {
  assert.equal(nextStep(STEP.GREETING), STEP.DESTINATION);
  assert.equal(previousStep(STEP.DESTINATION), STEP.GREETING);
  assert.equal(previousStep(STEP.GREETING), STEP.GREETING, 'never goes before the first step');
  assert.equal(nextStep(STEP.RESULTS), STEP.RESULTS, 'never goes past the last step');
});

test('the greeting step is only complete once a property type (including "any") is chosen', () => {
  const state = initialAssistantState();
  assert.equal(isStepComplete(STEP.GREETING, state), false);
  assert.equal(isStepComplete(STEP.GREETING, { ...state, propertyType: null }), true, '"Any suitable property" is null, not undefined, and must count as answered');
  assert.equal(isStepComplete(STEP.GREETING, { ...state, propertyType: 'HOTEL' }), true);
});

test('the destination step requires a real resolved place or a specific hotel, not free text alone', () => {
  const state = initialAssistantState();
  assert.equal(isStepComplete(STEP.DESTINATION, state), false);
  assert.equal(isStepComplete(STEP.DESTINATION, { ...state, destination: { type: 'CITY', destination: 'goa' } }), true);
  assert.equal(isStepComplete(STEP.DESTINATION, { ...state, destination: { type: 'HOTEL', hotelSlug: 'taj-goa' } }), true);
});

test('the dates step rejects a missing check-out, a reversed range, and a check-in before today', () => {
  const state = initialAssistantState();
  const today = '2026-06-01';
  assert.equal(isStepComplete(STEP.DATES, { ...state, checkIn: '2026-06-05' }, today), false, 'no check-out yet');
  assert.equal(isStepComplete(STEP.DATES, { ...state, checkIn: '2026-06-07', checkOut: '2026-06-05' }, today), false, 'check-out before check-in');
  assert.equal(isStepComplete(STEP.DATES, { ...state, checkIn: '2026-05-20', checkOut: '2026-05-22' }, today), false, 'check-in before today');
  assert.equal(isStepComplete(STEP.DATES, { ...state, checkIn: '2026-06-05', checkOut: '2026-06-07' }, today), true);
});

test('the guests step requires at least one room with at least one adult', () => {
  const state = initialAssistantState();
  assert.equal(isStepComplete(STEP.GUESTS, state), true, 'the default occupancy (1 room, 2 adults) is already valid');
  assert.equal(isStepComplete(STEP.GUESTS, { ...state, occupancy: [] }), false);
  assert.equal(isStepComplete(STEP.GUESTS, { ...state, occupancy: [{ adults: 0, childAges: [] }] }), false);
});

test('preferences and budget are always optional -- the user can always continue', () => {
  const state = initialAssistantState();
  assert.equal(isStepComplete(STEP.PREFERENCES, state), true);
  assert.equal(isStepComplete(STEP.BUDGET, state), true);
});

test('totalBudgetToPerNightMax normalises a whole-stay budget into a comparable per-night maximum', () => {
  assert.equal(totalBudgetToPerNightMax(21000, 3), 7000);
  assert.equal(totalBudgetToPerNightMax(10000, 3), 3333, 'rounds down -- never claims more room than the budget actually allows');
});

test('totalBudgetToPerNightMax refuses to normalise without a known, positive nights count', () => {
  assert.equal(totalBudgetToPerNightMax(10000, 0), null);
  assert.equal(totalBudgetToPerNightMax(10000, null), null);
  assert.equal(totalBudgetToPerNightMax(10000, undefined), null);
});

test('totalBudgetToPerNightMax rejects a non-positive or invalid total', () => {
  assert.equal(totalBudgetToPerNightMax(0, 3), null);
  assert.equal(totalBudgetToPerNightMax(-500, 3), null);
  assert.equal(totalBudgetToPerNightMax(NaN, 3), null);
});

test('toSearchState produces exactly the shape searchParams.js#toSearchParams already knows how to serialize', () => {
  const assistant = {
    checkIn: '2026-06-05',
    checkOut: '2026-06-07',
    occupancy: [{ adults: 2, childAges: [] }],
    stars: [4, 5],
    amenities: ['WIFI', 'POOL'],
    dinnerIncluded: true,
    freeCancellation: true,
    propertyType: 'VILLA',
    minPrice: 2000,
    maxPrice: 4000,
  };
  const state = toSearchState(assistant);
  assert.equal(state.checkIn, '2026-06-05');
  assert.deepEqual(state.occupancy, [{ adults: 2, childAges: [] }]);
  assert.deepEqual(state.filters.stars, [4, 5]);
  assert.deepEqual(state.filters.amenities, ['WIFI', 'POOL']);
  assert.deepEqual(state.filters.mealPlans, ['HALF_BOARD', 'FULL_BOARD']);
  assert.equal(state.filters.freeCancellation, true);
  assert.deepEqual(state.filters.propertyTypes, ['VILLA']);
  assert.equal(state.filters.minPrice, 2000);
  assert.equal(state.filters.maxPrice, 4000);
});

test('firstIncompleteStep lands on the earliest missing answer, in order', () => {
  const state = initialAssistantState();
  assert.equal(firstIncompleteStep(state, '2026-06-01'), STEP.GREETING);
  assert.equal(firstIncompleteStep({ ...state, propertyType: 'HOTEL' }, '2026-06-01'), STEP.DESTINATION);
  assert.equal(
    firstIncompleteStep({ ...state, propertyType: 'HOTEL', destination: { destination: 'goa' } }, '2026-06-01'),
    STEP.DATES,
  );
});

test('firstIncompleteStep is RESULTS once everything required is already known', () => {
  const state = {
    ...initialAssistantState(),
    propertyType: null,
    destination: { destination: 'goa' },
    checkIn: '2026-06-05',
    checkOut: '2026-06-07',
  };
  assert.equal(firstIncompleteStep(state, '2026-06-01'), STEP.RESULTS);
});

test('mergeExtractedCriteria only overwrites fields the extraction actually resolved', () => {
  const state = { ...initialAssistantState(), amenities: ['WIFI'], propertyType: 'HOTEL' };
  const merged = mergeExtractedCriteria(state, { checkIn: '2026-06-05', checkOut: '2026-06-07' });
  assert.equal(merged.checkIn, '2026-06-05');
  assert.equal(merged.propertyType, 'HOTEL', 'untouched by an extraction that said nothing about property type');
  assert.deepEqual(merged.amenities, ['WIFI'], 'untouched existing amenity is preserved');
});

test('mergeExtractedCriteria unions new amenities with ones already chosen, never discarding either', () => {
  const state = { ...initialAssistantState(), amenities: ['WIFI'] };
  const merged = mergeExtractedCriteria(state, { amenities: ['POOL'] });
  assert.deepEqual(merged.amenities.sort(), ['POOL', 'WIFI']);
});

test('mergeExtractedCriteria applies an explicit null propertyType ("any suitable property"), distinct from "not mentioned"', () => {
  const state = { ...initialAssistantState(), propertyType: 'HOTEL' };
  const merged = mergeExtractedCriteria(state, { propertyType: null });
  assert.equal(merged.propertyType, null);
});

test('mergeExtractedCriteria converts a PER_NIGHT budget straight to maxPrice', () => {
  const state = initialAssistantState();
  const merged = mergeExtractedCriteria(state, { budget: { amount: 4000, type: 'PER_NIGHT' } });
  assert.equal(merged.maxPrice, 4000);
});

test('mergeExtractedCriteria converts a TOTAL_STAY budget to a per-night max only once dates are known', () => {
  const withoutDates = mergeExtractedCriteria(initialAssistantState(), { budget: { amount: 15000, type: 'TOTAL_STAY' } });
  assert.equal(withoutDates.maxPrice, undefined, 'cannot normalise a total-stay budget without a nights count');

  const withDates = mergeExtractedCriteria(
    { ...initialAssistantState(), checkIn: '2026-11-12', checkOut: '2026-11-15' },
    { budget: { amount: 15000, type: 'TOTAL_STAY' } },
  );
  assert.equal(withDates.maxPrice, 5000, '15000 / 3 nights');
});

test('toggleCompare adds and removes ids, capped at MAX_COMPARE', () => {
  let ids = [];
  ids = toggleCompare(ids, 1);
  ids = toggleCompare(ids, 2);
  ids = toggleCompare(ids, 3);
  assert.deepEqual(ids, [1, 2, 3]);
  const capped = toggleCompare(ids, 4);
  assert.deepEqual(capped, [1, 2, 3], `cannot exceed MAX_COMPARE (${MAX_COMPARE})`);
  const removed = toggleCompare(ids, 2);
  assert.deepEqual(removed, [1, 3]);
});

test('toSearchState omits empty preferences rather than sending empty/false filters', () => {
  const assistant = { ...initialAssistantState(), propertyType: null };
  const state = toSearchState(assistant);
  assert.equal(state.filters.propertyTypes, undefined, '"any suitable property" sends no propertyTypes filter at all');
  assert.equal(state.filters.mealPlans, undefined);
  assert.equal(state.filters.amenities, undefined);
  assert.equal(state.filters.freeCancellation, undefined);
});
