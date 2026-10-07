/**
 * Occupancy is a list of rooms, each with its adults and children's ages:
 *   [{ adults: 2, childAges: [7, 12] }, { adults: 1, childAges: [] }]
 *
 * URL form (shareable, reloadable): rooms separated by "|", each room is "<adults>" optionally followed by
 * "-" and the children's ages separated by ".":   "2-7.12|1"  ==  the structure above.
 */

export const LIMITS = Object.freeze({
  maxRooms: 8,
  minAdults: 1,
  maxAdults: 6,
  maxChildrenPerRoom: 4,
  minAge: 0,
  maxAge: 17,
});

export const DEFAULT_OCCUPANCY = Object.freeze([{ adults: 2, childAges: [] }]);

export class OccupancyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OccupancyError';
  }
}

/** Parses the URL form. Throws OccupancyError with a readable message for anything out of range. */
export function parseOccupancy(value) {
  if (value == null || String(value).trim() === '') return DEFAULT_OCCUPANCY.map((room) => ({ ...room, childAges: [] }));
  const segments = String(value).split('|');
  if (segments.length > LIMITS.maxRooms) throw new OccupancyError(`Choose at most ${LIMITS.maxRooms} rooms`);

  return segments.map((segment) => {
    const [adultsPart, agesPart = ''] = segment.split('-');
    if (!/^\d+$/.test(adultsPart)) throw new OccupancyError('Adults must be a whole number');
    const adults = Number(adultsPart);
    if (adults < LIMITS.minAdults || adults > LIMITS.maxAdults) {
      throw new OccupancyError(`Each room needs ${LIMITS.minAdults} to ${LIMITS.maxAdults} adults`);
    }

    const childAges = agesPart === '' ? [] : agesPart.split('.').map((age) => {
      if (!/^\d+$/.test(age)) throw new OccupancyError('Children ages must be whole numbers');
      const n = Number(age);
      if (n < LIMITS.minAge || n > LIMITS.maxAge) throw new OccupancyError(`Children must be ${LIMITS.minAge} to ${LIMITS.maxAge} years old`);
      return n;
    });
    if (childAges.length > LIMITS.maxChildrenPerRoom) {
      throw new OccupancyError(`Each room allows at most ${LIMITS.maxChildrenPerRoom} children`);
    }
    return { adults, childAges };
  });
}

/** Canonical URL form, so the same occupancy always produces the same URL. */
export function formatOccupancy(rooms) {
  return rooms.map((room) => `${room.adults}${room.childAges.length ? `-${room.childAges.join('.')}` : ''}`).join('|');
}

/** Totals for display and for legacy API parameters. */
export function occupancyTotals(rooms) {
  return {
    rooms: rooms.length,
    adults: rooms.reduce((sum, room) => sum + room.adults, 0),
    children: rooms.reduce((sum, room) => sum + room.childAges.length, 0),
  };
}

/**
 * Converts the legacy totals (rooms, adults, children) into an occupancy, splitting evenly across rooms.
 * Used by the original availability parameters so both forms give the same answer.
 */
export function occupancyFromTotals({ rooms, adults, children }) {
  const adultsPerRoom = Math.ceil(adults / rooms);
  const childrenPerRoom = Math.ceil(children / rooms);
  // Legacy callers only send counts, so ages are placeholders; availability depends on counts alone.
  return Array.from({ length: rooms }, () => ({ adults: adultsPerRoom, childAges: Array(childrenPerRoom).fill(LIMITS.minAge) }));
}
