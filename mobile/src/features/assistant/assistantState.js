/**
 * Pure state/logic for the mobile Booking Assistant. No React Native APIs except AsyncStorage (isolated
 * to saveDraft/loadDraft/clearDraft at the bottom) -- everything else is directly unit-testable with
 * plain Node, same convention as the website's own features/support/assistantState.js, which this is a
 * straight port of. The assistant only ever COLLECTS a search state; it never computes a price, an
 * availability result, or anything the real search/booking APIs are authoritative for.
 *
 * Mobile difference from the website version: there is no ROOM_SELECT/BOOKING_REVIEW step here. Once the
 * user picks a real hotel from RESULTS, the chat hands off to the existing HotelDetailsScreen -> Room
 * Selection -> Booking -> Payment stack (the same screens SearchScreen/HomeScreen already navigate to),
 * so room selection, holds, and payment are never duplicated inside the chat.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const STEP = Object.freeze({
  GREETING: 'GREETING',
  DESTINATION: 'DESTINATION',
  DATES: 'DATES',
  GUESTS: 'GUESTS',
  PREFERENCES: 'PREFERENCES',
  BUDGET: 'BUDGET',
  RESULTS: 'RESULTS',
});

export const STEP_ORDER = [STEP.GREETING, STEP.DESTINATION, STEP.DATES, STEP.GUESTS, STEP.PREFERENCES, STEP.BUDGET, STEP.RESULTS];

export const AMENITY_PREFERENCE_OPTIONS = [
  { code: 'WIFI', label: 'Wi-Fi' },
  { code: 'POOL', label: 'Swimming pool' },
  { code: 'PARKING', label: 'Parking' },
  { code: 'BREAKFAST', label: 'Breakfast' },
  { code: 'PETS_ALLOWED', label: 'Pet-friendly' },
];

export const STAR_RATING_OPTIONS = [
  { id: 'any', label: 'Any rating', stars: undefined },
  { id: '3plus', label: '3-star & above', stars: [3, 4, 5] },
  { id: '4plus', label: '4-star & above', stars: [4, 5] },
  { id: '5only', label: '5-star only', stars: [5] },
];

export const BUDGET_PRESETS = [
  { id: 'under_2000', label: 'Under ₹2,000 / night', minPrice: undefined, maxPrice: 2000 },
  { id: '2000_4000', label: '₹2,000 – ₹4,000 / night', minPrice: 2000, maxPrice: 4000 },
  { id: '4000_7000', label: '₹4,000 – ₹7,000 / night', minPrice: 4000, maxPrice: 7000 },
  { id: 'over_7000', label: '₹7,000+ / night', minPrice: 7000, maxPrice: undefined },
];

export function initialAssistantState() {
  return {
    step: STEP.GREETING,
    language: 'en', // 'en' | 'hi'
    propertyType: undefined, // null = "any", undefined = not yet chosen
    destination: null, // { type, label, destination, area, hotelSlug }
    checkIn: null,
    checkOut: null,
    occupancy: [{ adults: 2, childAges: [] }],
    stars: undefined,
    amenities: [],
    dinnerIncluded: false,
    freeCancellation: false,
    minPrice: undefined,
    maxPrice: undefined,
  };
}

export function totalBudgetToPerNightMax(totalRupees, nights) {
  const total = Number(totalRupees);
  const n = Number(nights);
  if (!Number.isFinite(total) || total <= 0) return null;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, Math.floor(total / n));
}

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
      return true;
    case STEP.BUDGET:
      return true;
    default:
      return true;
  }
}

export function firstIncompleteStep(state, today) {
  for (const step of STEP_ORDER) {
    if (!isStepComplete(step, state, today)) return step;
  }
  return STEP.RESULTS;
}

/** Merges a validated extraction (local parser, or the backend AI's /assistant/extract response) into the
 * current state -- only ever overwrites a field the extraction actually resolved. */
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
  }
  return next;
}

function dateDiffDays(checkIn, checkOut) {
  return Math.round((new Date(`${checkOut}T00:00:00Z`) - new Date(`${checkIn}T00:00:00Z`)) / 86_400_000);
}

export function nextStep(step) {
  const i = STEP_ORDER.indexOf(step);
  return STEP_ORDER[Math.min(i + 1, STEP_ORDER.length - 1)];
}

export function previousStep(step) {
  const i = STEP_ORDER.indexOf(step);
  return STEP_ORDER[Math.max(i - 1, 0)];
}

/** Builds the exact shape hotelsApi.search (via searchParams-style params) already knows how to consume
 * -- the assistant never invents its own filter shape, it only mirrors the real search screen's. */
export function toSearchParams(assistant) {
  return {
    destination: assistant.destination?.destination,
    area: assistant.destination?.area ?? undefined,
    checkIn: assistant.checkIn,
    checkOut: assistant.checkOut,
    occ: assistant.occupancy.map((room) => `${room.adults}${room.childAges.length ? `-${room.childAges.join('.')}` : ''}`).join('|'),
    sort: 'recommended',
    page: 1,
    minPrice: assistant.minPrice,
    maxPrice: assistant.maxPrice,
    stars: assistant.stars?.length ? assistant.stars.join(',') : undefined,
    propertyTypes: assistant.propertyType ? assistant.propertyType : undefined,
    amenities: assistant.amenities.length ? assistant.amenities.join(',') : undefined,
    freeCancellation: assistant.freeCancellation ? 'true' : undefined,
  };
}

const STORAGE_KEY = 'gokaasa:assistant-draft:v1';

/**
 * Only the non-sensitive search draft is persisted -- destination/dates/guests/preferences/budget. The
 * assistant never collects a guest's name, email, phone, or anything payment-related, so there is nothing
 * sensitive to accidentally persist here. AsyncStorage is async (unlike the website's sessionStorage), so
 * callers must await loadDraft() rather than reading it synchronously on first render.
 */
export async function saveDraft(state) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable; losing the draft is not fatal.
  }
}

export async function loadDraft() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearDraft() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do if storage isn't available.
  }
}
