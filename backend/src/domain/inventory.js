/**
 * Availability rules. Inputs are derived facts (settings, blocks, reservations); outputs are decisions.
 * Nothing here trusts client-supplied counts.
 */

/** Rooms that can still be sold for one night. A closed night sells nothing. */
export function sellableUnits({ totalUnits, unitsOverride = null, isClosed = false, blocked = 0, reserved = 0 }) {
  if (isClosed) return 0;
  const total = unitsOverride ?? totalUnits;
  return Math.max(0, total - blocked - reserved);
}

/**
 * Guests are split evenly across the rooms requested. Each room must fit within the room type's limits.
 */
export function occupancyFits({ rooms, adults, children, maxAdults, maxChildren, maxOccupancy }) {
  const adultsPerRoom = Math.ceil(adults / rooms);
  const childrenPerRoom = Math.ceil(children / rooms);
  if (adultsPerRoom < 1) return false;
  return adultsPerRoom <= maxAdults && childrenPerRoom <= maxChildren && adultsPerRoom + childrenPerRoom <= maxOccupancy;
}

/**
 * Stay length limits across the nights of a stay. The strictest limit on any night applies.
 * @returns {{ ok: boolean, minRequired: number|null, maxAllowed: number|null }}
 */
export function stayLengthCheck(nightFacts, nights) {
  const mins = nightFacts.map((night) => night.min_stay).filter((value) => value != null);
  const maxes = nightFacts.map((night) => night.max_stay).filter((value) => value != null);
  const minRequired = mins.length ? Math.max(...mins) : null;
  const maxAllowed = maxes.length ? Math.min(...maxes) : null;
  const ok = (minRequired == null || nights >= minRequired) && (maxAllowed == null || nights <= maxAllowed);
  return { ok, minRequired, maxAllowed };
}
