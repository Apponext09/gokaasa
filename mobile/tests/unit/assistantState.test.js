import {
  STEP,
  clearDraft,
  firstIncompleteStep,
  initialAssistantState,
  isStepComplete,
  loadDraft,
  mergeExtractedCriteria,
  nextStep,
  previousStep,
  saveDraft,
  toSearchParams,
  totalBudgetToPerNightMax,
} from '../../src/features/assistant/assistantState.js';

// A port of the website's tests/unit/assistantState.test.js for the SAME step logic (this module is a
// direct port, see its header comment), minus the website-only ROOM_SELECT/BOOKING_REVIEW/compare tests
// (the mobile assistant hands off to the existing HotelDetailsScreen instead of reimplementing those
// steps -- see assistantState.js and AssistantScreen.js's header comments), plus new coverage for the
// AsyncStorage-backed draft persistence, which is async here unlike the website's sessionStorage version.

describe('step machine', () => {
  test('initial state starts at the greeting with no property type chosen yet', () => {
    const state = initialAssistantState();
    expect(state.step).toBe(STEP.GREETING);
    expect(state.propertyType).toBeUndefined();
  });

  test('nextStep/previousStep walk the fixed step order and clamp at the ends', () => {
    expect(nextStep(STEP.GREETING)).toBe(STEP.DESTINATION);
    expect(previousStep(STEP.DESTINATION)).toBe(STEP.GREETING);
    expect(previousStep(STEP.GREETING)).toBe(STEP.GREETING);
    expect(nextStep(STEP.RESULTS)).toBe(STEP.RESULTS);
  });

  test('the greeting step is only complete once a property type (including "any") is chosen', () => {
    const state = initialAssistantState();
    expect(isStepComplete(STEP.GREETING, state)).toBe(false);
    expect(isStepComplete(STEP.GREETING, { ...state, propertyType: null })).toBe(true);
    expect(isStepComplete(STEP.GREETING, { ...state, propertyType: 'HOTEL' })).toBe(true);
  });

  test('the destination step requires a real resolved place or a specific hotel, not free text alone', () => {
    const state = initialAssistantState();
    expect(isStepComplete(STEP.DESTINATION, state)).toBe(false);
    expect(isStepComplete(STEP.DESTINATION, { ...state, destination: { type: 'CITY', destination: 'goa' } })).toBe(true);
    expect(isStepComplete(STEP.DESTINATION, { ...state, destination: { type: 'HOTEL', hotelSlug: 'taj-goa' } })).toBe(true);
  });

  test('the dates step rejects a missing check-out, a reversed range, and a check-in before today', () => {
    const state = initialAssistantState();
    const today = '2026-06-01';
    expect(isStepComplete(STEP.DATES, { ...state, checkIn: '2026-06-05' }, today)).toBe(false);
    expect(isStepComplete(STEP.DATES, { ...state, checkIn: '2026-06-07', checkOut: '2026-06-05' }, today)).toBe(false);
    expect(isStepComplete(STEP.DATES, { ...state, checkIn: '2026-05-20', checkOut: '2026-05-22' }, today)).toBe(false);
    expect(isStepComplete(STEP.DATES, { ...state, checkIn: '2026-06-05', checkOut: '2026-06-07' }, today)).toBe(true);
  });

  test('the guests step requires at least one room with at least one adult', () => {
    const state = initialAssistantState();
    expect(isStepComplete(STEP.GUESTS, state)).toBe(true);
    expect(isStepComplete(STEP.GUESTS, { ...state, occupancy: [] })).toBe(false);
    expect(isStepComplete(STEP.GUESTS, { ...state, occupancy: [{ adults: 0, childAges: [] }] })).toBe(false);
  });

  test('preferences and budget are always optional -- the user can always continue', () => {
    const state = initialAssistantState();
    expect(isStepComplete(STEP.PREFERENCES, state)).toBe(true);
    expect(isStepComplete(STEP.BUDGET, state)).toBe(true);
  });

  test('firstIncompleteStep lands on the earliest missing answer, in order', () => {
    const state = initialAssistantState();
    expect(firstIncompleteStep(state, '2026-06-01')).toBe(STEP.GREETING);
    expect(firstIncompleteStep({ ...state, propertyType: 'HOTEL' }, '2026-06-01')).toBe(STEP.DESTINATION);
    expect(firstIncompleteStep({ ...state, propertyType: 'HOTEL', destination: { destination: 'goa' } }, '2026-06-01')).toBe(STEP.DATES);
  });

  test('firstIncompleteStep is RESULTS once everything required is already known', () => {
    const state = {
      ...initialAssistantState(),
      propertyType: null,
      destination: { destination: 'goa' },
      checkIn: '2026-06-05',
      checkOut: '2026-06-07',
    };
    expect(firstIncompleteStep(state, '2026-06-01')).toBe(STEP.RESULTS);
  });
});

describe('totalBudgetToPerNightMax', () => {
  test('normalises a whole-stay budget into a comparable per-night maximum', () => {
    expect(totalBudgetToPerNightMax(21000, 3)).toBe(7000);
    expect(totalBudgetToPerNightMax(10000, 3)).toBe(3333);
  });

  test('refuses to normalise without a known, positive nights count', () => {
    expect(totalBudgetToPerNightMax(10000, 0)).toBeNull();
    expect(totalBudgetToPerNightMax(10000, null)).toBeNull();
    expect(totalBudgetToPerNightMax(10000, undefined)).toBeNull();
  });

  test('rejects a non-positive or invalid total', () => {
    expect(totalBudgetToPerNightMax(0, 3)).toBeNull();
    expect(totalBudgetToPerNightMax(-500, 3)).toBeNull();
    expect(totalBudgetToPerNightMax(NaN, 3)).toBeNull();
  });
});

describe('mergeExtractedCriteria', () => {
  test('only overwrites fields the extraction actually resolved', () => {
    const state = { ...initialAssistantState(), amenities: ['WIFI'], propertyType: 'HOTEL' };
    const merged = mergeExtractedCriteria(state, { checkIn: '2026-06-05', checkOut: '2026-06-07' });
    expect(merged.checkIn).toBe('2026-06-05');
    expect(merged.propertyType).toBe('HOTEL');
    expect(merged.amenities).toEqual(['WIFI']);
  });

  test('unions new amenities with ones already chosen, never discarding either', () => {
    const state = { ...initialAssistantState(), amenities: ['WIFI'] };
    const merged = mergeExtractedCriteria(state, { amenities: ['POOL'] });
    expect(merged.amenities.sort()).toEqual(['POOL', 'WIFI']);
  });

  test('applies an explicit null propertyType ("any suitable property"), distinct from "not mentioned"', () => {
    const state = { ...initialAssistantState(), propertyType: 'HOTEL' };
    const merged = mergeExtractedCriteria(state, { propertyType: null });
    expect(merged.propertyType).toBeNull();
  });

  test('converts a PER_NIGHT budget straight to maxPrice', () => {
    const merged = mergeExtractedCriteria(initialAssistantState(), { budget: { amount: 4000, type: 'PER_NIGHT' } });
    expect(merged.maxPrice).toBe(4000);
  });

  test('converts a TOTAL_STAY budget to a per-night max only once dates are known', () => {
    const withoutDates = mergeExtractedCriteria(initialAssistantState(), { budget: { amount: 15000, type: 'TOTAL_STAY' } });
    expect(withoutDates.maxPrice).toBeUndefined();

    const withDates = mergeExtractedCriteria(
      { ...initialAssistantState(), checkIn: '2026-11-12', checkOut: '2026-11-15' },
      { budget: { amount: 15000, type: 'TOTAL_STAY' } },
    );
    expect(withDates.maxPrice).toBe(5000);
  });
});

describe('toSearchParams', () => {
  test('produces the flat query-param shape hotelsApi.search already consumes', () => {
    const assistant = {
      destination: { destination: 'navi-mumbai', area: null },
      checkIn: '2026-06-05',
      checkOut: '2026-06-07',
      occupancy: [{ adults: 2, childAges: [] }],
      stars: [4, 5],
      amenities: ['WIFI', 'POOL'],
      propertyType: 'VILLA',
      minPrice: 2000,
      maxPrice: 4000,
      freeCancellation: true,
    };
    const params = toSearchParams(assistant);
    expect(params.destination).toBe('navi-mumbai');
    expect(params.checkIn).toBe('2026-06-05');
    expect(params.occ).toBe('2');
    expect(params.stars).toBe('4,5');
    expect(params.amenities).toBe('WIFI,POOL');
    expect(params.propertyTypes).toBe('VILLA');
    expect(params.minPrice).toBe(2000);
    expect(params.maxPrice).toBe(4000);
    expect(params.freeCancellation).toBe('true');
  });

  test('a multi-room occupancy with children serializes as backend/src/domain/occupancy.js expects', () => {
    const assistant = {
      ...initialAssistantState(),
      occupancy: [{ adults: 2, childAges: [5, 8] }, { adults: 1, childAges: [] }],
    };
    expect(toSearchParams(assistant).occ).toBe('2-5.8|1');
  });

  test('omits empty preferences rather than sending empty/false filters', () => {
    const assistant = { ...initialAssistantState(), propertyType: null };
    const params = toSearchParams(assistant);
    expect(params.propertyTypes).toBeUndefined();
    expect(params.amenities).toBeUndefined();
    expect(params.freeCancellation).toBeUndefined();
    expect(params.stars).toBeUndefined();
  });
});

describe('draft persistence (AsyncStorage)', () => {
  test('loadDraft returns null when nothing has been saved yet', async () => {
    await clearDraft();
    expect(await loadDraft()).toBeNull();
  });

  test('saveDraft then loadDraft round-trips the exact state', async () => {
    const state = { ...initialAssistantState(), step: STEP.BUDGET, maxPrice: 4000 };
    await saveDraft(state);
    const loaded = await loadDraft();
    expect(loaded).toEqual(state);
  });

  test('clearDraft removes a previously saved draft', async () => {
    await saveDraft(initialAssistantState());
    await clearDraft();
    expect(await loadDraft()).toBeNull();
  });
});
