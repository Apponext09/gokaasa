/**
 * Pure state/logic for the Smart Booking Assistant. No browser APIs, no React -- directly testable with
 * plain Node, matching the convention already used by searchParams.js/bookingSchemas.js. The assistant
 * only ever COLLECTS a search state; it never computes a price, an availability result, or anything the
 * real search/booking APIs are authoritative for.
 */

export const STEP = Object.freeze({
  GREETING: 'GREETING',
  DESTINATION: 'DESTINATION',
  DATES: 'DATES',
  GUESTS: 'GUESTS',
  PREFERENCES: 'PREFERENCES',
  BUDGET: 'BUDGET',
  RESULTS: 'RESULTS',
  ROOM_SELECT: 'ROOM_SELECT',
  BOOKING_REVIEW: 'BOOKING_REVIEW',
});

// ROOM_SELECT/BOOKING_REVIEW are reached only by explicitly picking a property from real results (Mode C)
// -- they are not part of the normal forward/back walk through the discovery questions.
export const STEP_ORDER = [STEP.GREETING, STEP.DESTINATION, STEP.DATES, STEP.GUESTS, STEP.PREFERENCES, STEP.BUDGET, STEP.RESULTS];

export const MAX_COMPARE = 3;

export const PROPERTY_TYPE_OPTIONS = [
  { value: 'HOTEL', label: 'Hotel' },
  { value: 'RESORT', label: 'Resort' },
  { value: 'VILLA', label: 'Villa' },
  { value: null, label: 'Any suitable property' },
];

/**
 * Real amenity catalogue codes only (seeds/001_amenities.js) -- "Family-friendly" is deliberately not
 * offered: there is no single existing field that unambiguously means that (KIDS_CLUB is a property
 * amenity, not a verified "family-friendly" designation), and inventing that equivalence would be
 * exactly the kind of fabricated mapping this feature must avoid. PETS_ALLOWED is real and is offered.
 */
export const AMENITY_PREFERENCE_OPTIONS = [
  { code: 'WIFI', label: 'Wi-Fi' },
  { code: 'POOL', label: 'Swimming pool' },
  { code: 'PARKING', label: 'Parking' },
  { code: 'BREAKFAST', label: 'Breakfast' },
  { code: 'PETS_ALLOWED', label: 'Pet-friendly' },
];

/** "4-star & above" reads better in a guided chat than a flat multi-select; this expands to the exact filter. */
export const STAR_RATING_OPTIONS = [
  { id: 'any', label: 'Any rating', stars: undefined },
  { id: '3plus', label: '3-star & above', stars: [3, 4, 5] },
  { id: '4plus', label: '4-star & above', stars: [4, 5] },
  { id: '5only', label: '5-star only', stars: [5] },
];

/** Per-night rupee presets. "Enter my own" is handled separately by the caller (custom min/max or total-stay). */
export const BUDGET_PRESETS = [
  { id: 'under_2000', label: 'Under ₹2,000 / night', minPrice: undefined, maxPrice: 2000 },
  { id: '2000_4000', label: '₹2,000 – ₹4,000 / night', minPrice: 2000, maxPrice: 4000 },
  { id: '4000_7000', label: '₹4,000 – ₹7,000 / night', minPrice: 4000, maxPrice: 7000 },
  { id: 'over_7000', label: '₹7,000+ / night', minPrice: 7000, maxPrice: undefined },
];

export function initialAssistantState() {
  return {
    step: STEP.GREETING,
    language: 'en', // 'en' | 'hi' -- user-selected, changeable at any time, independent of browser speech support
    propertyType: undefined, // null = "any", undefined = not yet chosen
    destination: null, // { type, label, subtitle, destination, area, hotelSlug }
    checkIn: null,
    checkOut: null,
    occupancy: [{ adults: 2, childAges: [] }],
    stars: undefined,
    amenities: [],
    dinnerIncluded: false,
    freeCancellation: false,
    minPrice: undefined,
    maxPrice: undefined,
    compareIds: [],
    // Mode C: set once the user picks a specific property/room from real results.
    selectedHotel: null, // { id, slug, name, city }
    selectedRoom: null, // { room, plan } -- the exact objects RoomCard's onSelect(room, plan) already gives
    hold: null, // the real hold returned by bookingApi.createHold once Mode C creates one
  };
}

/**
 * A total-stay budget is only meaningful once the nights count is known, and must never be compared
 * directly against a per-night price -- this converts it to an equivalent per-night maximum, the same
 * unit every other budget option and the search API itself already use. Returns null when nights isn't
 * known yet (the caller should not offer this option before dates are chosen).
 */
export function totalBudgetToPerNightMax(totalRupees, nights) {
  const total = Number(totalRupees);
  const n = Number(nights);
  if (!Number.isFinite(total) || total <= 0) return null;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, Math.floor(total / n));
}

/** Whether the current step's required answer is present -- gates the "Next" action, never blocks silently. */
export function isStepComplete(step, state, today) {
  switch (step) {
    case STEP.GREETING:
      return state.propertyType !== undefined;
    case STEP.DESTINATION:
      return Boolean(state.destination?.destination || state.destination?.hotelSlug);
    case STEP.DATES:
      return Boolean(state.checkIn && state.checkOut && state.checkOut > state.checkIn && (!today || state.checkIn >= today));
    case STEP.GUESTS:
      return state.occupancy.length > 0 && state.occupancy.every((r) => r.adults >= 1);
    case STEP.PREFERENCES:
      return true; // every preference here is optional
    case STEP.BUDGET:
      return true; // budget is optional too -- "skip" is always valid
    default:
      return true;
  }
}

/** The first step (in the normal discovery order) whose required answer is still missing. Used after an
 * AI extraction to land the user exactly where they still need to confirm or fill something in, rather
 * than jumping straight to results on an incomplete or unconfirmed guess. */
export function firstIncompleteStep(state, today) {
  for (const step of STEP_ORDER) {
    if (!isStepComplete(step, state, today)) return step;
  }
  return STEP.RESULTS;
}

/**
 * Merges a validated extraction result (backend POST /api/assistant/extract response's `criteria`) into
 * the current state. Only ever overwrites a field the extraction actually resolved -- anything the
 * backend left out (because it was missing, invalid, or unsupported) leaves the existing answer alone,
 * so switching to AI input never discards a valid preference the user already set in guided mode.
 */
export function mergeExtractedCriteria(state, criteria) {
  const next = { ...state };
  if (criteria.destination) next.destination = criteria.destination;
  if (criteria.checkIn) next.checkIn = criteria.checkIn;
  if (criteria.checkOut) next.checkOut = criteria.checkOut;
  if (criteria.occupancy) next.occupancy = criteria.occupancy;
  if ('propertyType' in criteria && criteria.propertyType !== undefined) next.propertyType = criteria.propertyType;
  if (criteria.stars) next.stars = criteria.stars;
  if (criteria.amenities) next.amenities = [...new Set([...(state.amenities ?? []), ...criteria.amenities])];
  if (typeof criteria.dinnerIncluded === 'boolean') next.dinnerIncluded = criteria.dinnerIncluded;
  if (typeof criteria.freeCancellation === 'boolean') next.freeCancellation = criteria.freeCancellation;

  if (criteria.budget) {
    const nights = next.checkIn && next.checkOut ? dateDiffDays(next.checkIn, next.checkOut) : 0;
    if (criteria.budget.type === 'PER_NIGHT') {
      next.maxPrice = criteria.budget.amount;
      next.minPrice = undefined;
    } else if (criteria.budget.type === 'TOTAL_STAY' && nights > 0) {
      const perNight = totalBudgetToPerNightMax(criteria.budget.amount, nights);
      if (perNight) {
        next.maxPrice = perNight;
        next.minPrice = undefined;
      }
    }
    // A TOTAL_STAY budget stated before dates are known can't be normalized yet -- left for the user to
    // set again in the Budget step once dates are resolved, rather than guessing a per-night figure.
  }
  return next;
}

function dateDiffDays(checkIn, checkOut) {
  return Math.round((new Date(`${checkOut}T00:00:00Z`) - new Date(`${checkIn}T00:00:00Z`)) / 86_400_000);
}

/** Toggles a hotel id in/out of the compare set, capped at MAX_COMPARE -- adding past the cap is a no-op. */
export function toggleCompare(compareIds, hotelId) {
  if (compareIds.includes(hotelId)) return compareIds.filter((id) => id !== hotelId);
  if (compareIds.length >= MAX_COMPARE) return compareIds;
  return [...compareIds, hotelId];
}

export function nextStep(step) {
  const i = STEP_ORDER.indexOf(step);
  return STEP_ORDER[Math.min(i + 1, STEP_ORDER.length - 1)];
}

export function previousStep(step) {
  const i = STEP_ORDER.indexOf(step);
  return STEP_ORDER[Math.max(i - 1, 0)];
}

/**
 * Builds the exact same `state.filters` shape searchParams.js#toSearchParams already knows how to
 * serialize -- the assistant never writes its own query-string logic, it only produces the same shape
 * the real search widget/results page already use and the backend already validates.
 */
export function toSearchState(assistant) {
  return {
    checkIn: assistant.checkIn,
    checkOut: assistant.checkOut,
    occupancy: assistant.occupancy,
    sort: 'recommended',
    page: 1,
    filters: {
      minPrice: assistant.minPrice,
      maxPrice: assistant.maxPrice,
      stars: assistant.stars,
      guestRating: undefined,
      propertyTypes: assistant.propertyType ? [assistant.propertyType] : undefined,
      amenities: assistant.amenities.length ? assistant.amenities : undefined,
      freeCancellation: assistant.freeCancellation || undefined,
      mealPlans: assistant.dinnerIncluded ? ['HALF_BOARD', 'FULL_BOARD'] : undefined,
    },
  };
}

const STORAGE_KEY = 'gokaasa:assistant-draft:v1';

/**
 * Only the non-sensitive search draft is ever persisted -- destination/dates/guests/preferences/budget.
 * The assistant never collects a guest's name, email, phone, or anything payment-related (those steps
 * are handled entirely by the existing, separate booking flow after hand-off), so there is nothing
 * sensitive to accidentally persist here.
 */
export function saveDraft(state) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable (private browsing, quota); losing the draft is not fatal.
  }
}

export function loadDraft() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do if storage isn't available.
  }
}
