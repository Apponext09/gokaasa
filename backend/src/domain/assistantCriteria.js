/**
 * Validates and normalizes raw AI output into the same shape the existing guided chatbot already
 * produces (frontend/src/features/support/assistantState.js#toSearchState) -- pure and network-free, so
 * every rejection rule here is directly unit-testable without a real AI provider. AI output is treated as
 * completely untrusted input: anything that doesn't match a real, already-supported value is dropped or
 * flagged as missing, never guessed or invented.
 *
 * This never queries the database or calls the real search API itself -- it only produces validated
 * criteria that the caller (assistant.service.js) resolves against real destination data, and that the
 * frontend then passes to the existing, unmodified /hotels/search endpoint.
 */

import { MAX_STAY_NIGHTS, nightsBetween, parseDate } from './pricing.js';
import { LIMITS } from './occupancy.js';

export const REAL_PROPERTY_TYPES = Object.freeze(['HOTEL', 'RESORT', 'VILLA', 'APARTMENT', 'HOSTEL', 'GUEST_HOUSE']);

// The same curated, already-vetted subset the guided flow itself offers (assistantState.js's
// AMENITY_PREFERENCE_OPTIONS) -- kept identical on purpose so AI mode never offers a filter vocabulary
// the guided UI doesn't, which would otherwise be a confusing mismatch between the two modes.
export const REAL_AMENITY_CODES = Object.freeze(['WIFI', 'POOL', 'PARKING', 'BREAKFAST', 'PETS_ALLOWED']);

export const BUDGET_TYPES = Object.freeze(['PER_NIGHT', 'TOTAL_STAY']);

/**
 * Validates one parsed JSON object against the illustrative extraction schema. Returns
 * `{ criteria, missingInformation, problems }` -- `criteria` only ever contains fields that passed
 * validation; anything invalid or unsupported is dropped and named in `problems` (for logging/debugging)
 * and, where it blocks a usable search, added to `missingInformation` (shown to the user as a follow-up).
 * Never throws on bad AI output -- bad output is business-as-usual here, not an exceptional case.
 */
export function validateAiCriteria(raw, { today, propertyTypes = REAL_PROPERTY_TYPES, amenityCodes = REAL_AMENITY_CODES }) {
  const problems = [];
  const missingInformation = [];
  const criteria = {};

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { criteria: {}, missingInformation: ['destination', 'dates'], problems: ['AI output was not a JSON object'] };
  }

  // ---- destination (resolved against real data by the caller; this only checks shape) --------------
  if (typeof raw.destinationQuery === 'string' && raw.destinationQuery.trim().length >= 2) {
    criteria.destinationQuery = raw.destinationQuery.trim().slice(0, 80);
  } else {
    missingInformation.push('destination');
  }

  // ---- dates: both required, real calendar dates, check-in not in the past, check-out after check-in,
  // and never silently guessing a year -- a date missing a resolvable year is rejected outright rather
  // than defaulted, so a stale/wrong-year guess from the model is caught here, not passed through.
  const checkIn = typeof raw.checkIn === 'string' && parseDate(raw.checkIn) ? raw.checkIn : null;
  const checkOut = typeof raw.checkOut === 'string' && parseDate(raw.checkOut) ? raw.checkOut : null;
  if (!checkIn || !checkOut) {
    missingInformation.push('dates');
    if (raw.checkIn && !checkIn) problems.push(`invalid checkIn: ${JSON.stringify(raw.checkIn)}`);
    if (raw.checkOut && !checkOut) problems.push(`invalid checkOut: ${JSON.stringify(raw.checkOut)}`);
  } else if (checkIn < today) {
    missingInformation.push('dates');
    problems.push('checkIn is in the past (or the model guessed the wrong year)');
  } else if (checkOut <= checkIn) {
    missingInformation.push('dates');
    problems.push('checkOut is not after checkIn');
  } else if (nightsBetween(checkIn, checkOut).length > MAX_STAY_NIGHTS) {
    missingInformation.push('dates');
    problems.push(`stay exceeds the maximum of ${MAX_STAY_NIGHTS} nights`);
  } else {
    criteria.checkIn = checkIn;
    criteria.checkOut = checkOut;
  }

  // ---- guests and rooms: real occupancy limits, identical to the guided flow's own GuestsPopover caps -
  const adults = Number.isInteger(raw.adults) ? raw.adults : null;
  const rooms = Number.isInteger(raw.rooms) && raw.rooms > 0 ? raw.rooms : 1;
  const childrenRaw = Array.isArray(raw.children) ? raw.children : [];
  const validChildAges = childrenRaw.every((age) => Number.isInteger(age) && age >= LIMITS.minAge && age <= LIMITS.maxAge);

  if (adults == null || adults < LIMITS.minAdults) {
    missingInformation.push('guests');
  } else if (rooms > LIMITS.maxRooms) {
    problems.push(`requested ${rooms} rooms, which exceeds the maximum of ${LIMITS.maxRooms}`);
    missingInformation.push('guests');
  } else if (!validChildAges) {
    problems.push('one or more child ages were invalid');
    missingInformation.push('guests');
  } else {
    // Occupancy is distributed evenly across the requested room count, the same convention
    // occupancyFromTotals already uses elsewhere -- adults/children spread as evenly as possible,
    // never invented, never fabricated beyond what the user actually stated.
    const perRoomAdults = Math.floor(adults / rooms);
    const extraAdults = adults % rooms;
    const occupancy = Array.from({ length: rooms }, (_, i) => ({
      adults: perRoomAdults + (i < extraAdults ? 1 : 0),
      childAges: [],
    }));
    let childIndex = 0;
    for (const age of childrenRaw) {
      occupancy[childIndex % rooms].childAges.push(age);
      childIndex += 1;
    }
    if (occupancy.some((room) => room.adults < LIMITS.minAdults || room.adults > LIMITS.maxAdults || room.childAges.length > LIMITS.maxChildrenPerRoom)) {
      problems.push('guest distribution across rooms is not valid for a single room');
      missingInformation.push('guests');
    } else {
      criteria.occupancy = occupancy;
    }
  }

  // ---- property type: a real enum value, or null for "any suitable property" (explicit, not missing) -
  if (raw.propertyType === null) {
    criteria.propertyType = null;
  } else if (typeof raw.propertyType === 'string' && propertyTypes.includes(raw.propertyType.toUpperCase())) {
    criteria.propertyType = raw.propertyType.toUpperCase();
  } else if (raw.propertyType !== undefined) {
    problems.push(`unsupported propertyType: ${JSON.stringify(raw.propertyType)}`);
  }

  // ---- star rating: "X and above", matching the guided flow's own STAR_RATING_OPTIONS semantics -------
  if (raw.rating === null || raw.rating === undefined) {
    // no preference stated -- fine, leaves criteria.stars unset
  } else if (Number.isInteger(raw.rating) && raw.rating >= 1 && raw.rating <= 5) {
    criteria.stars = Array.from({ length: 5 - raw.rating + 1 }, (_, i) => raw.rating + i);
  } else {
    problems.push(`unsupported rating: ${JSON.stringify(raw.rating)}`);
  }

  // ---- amenities: only real, already-supported codes pass through; anything else is silently dropped
  // (not rejected outright -- one unsupported amenity shouldn't block an otherwise-valid search) --------
  if (Array.isArray(raw.amenities)) {
    const kept = raw.amenities.filter((code) => typeof code === 'string' && amenityCodes.includes(code.toUpperCase())).map((c) => c.toUpperCase());
    const dropped = raw.amenities.filter((code) => !kept.includes(String(code).toUpperCase()));
    if (dropped.length) problems.push(`dropped unsupported amenities: ${JSON.stringify(dropped)}`);
    if (kept.length) criteria.amenities = [...new Set(kept)];
  }

  // ---- dinner inclusion / free cancellation: plain booleans, or ignored if not actually boolean --------
  if (typeof raw.dinnerIncluded === 'boolean') criteria.dinnerIncluded = raw.dinnerIncluded;
  if (typeof raw.freeCancellation === 'boolean') criteria.freeCancellation = raw.freeCancellation;

  // ---- budget: a positive amount with an EXPLICIT type -- never inferred, never defaulted --------------
  if (raw.budget && typeof raw.budget === 'object') {
    const amount = Number(raw.budget.amount);
    const type = raw.budget.type;
    if (!Number.isFinite(amount) || amount <= 0) {
      problems.push(`invalid budget amount: ${JSON.stringify(raw.budget.amount)}`);
    } else if (!BUDGET_TYPES.includes(type)) {
      problems.push(`budget type must be explicit (PER_NIGHT or TOTAL_STAY), got: ${JSON.stringify(type)}`);
      missingInformation.push('budget');
    } else {
      criteria.budget = { amount: Math.floor(amount), type };
    }
  }

  return { criteria, missingInformation: [...new Set(missingInformation)], problems };
}
