/*
 * Search state lives in the URL. This module is the only place that reads or writes it, so a shared or reloaded
 * link always restores the same search. It has no path aliases and no browser APIs, so Node can test it directly.
 */

export const LIMITS = Object.freeze({
  maxRooms: 8,
  minAdults: 1,
  maxAdults: 6,
  maxChildrenPerRoom: 4,
  minAge: 0,
  maxAge: 17,
  maxNights: 30,
});

export const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'guest_rating', label: 'Guest rating' },
  { value: 'star_rating', label: 'Star rating' },
];

const SORTS = SORT_OPTIONS.map((o) => o.value);
const MEAL_PLANS = ['ROOM_ONLY', 'BREAKFAST', 'HALF_BOARD', 'FULL_BOARD'];
// The customer-facing filter only offers "Dinner Included" (half board / full board, the only plans that
// include dinner by definition). A URL carrying an older BREAKFAST/ROOM_ONLY value has no UI control to
// show or clear it, so it is dropped here rather than silently filtering results the visible filter can't explain.
export const DINNER_INCLUDED_MEAL_PLANS = Object.freeze(['HALF_BOARD', 'FULL_BOARD']);
const PROPERTY_TYPE_CODE = /^[A-Z][A-Z0-9_]{1,39}$/;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(iso, days) {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function nightsBetween(checkIn, checkOut) {
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut) || checkOut <= checkIn) return 0;
  return Math.round((new Date(`${checkOut}T00:00:00Z`) - new Date(`${checkIn}T00:00:00Z`)) / DAY_MS);
}

/** Today in the business calendar. This avoids UTC returning yesterday between midnight and 05:30 IST. */
export function todayIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${value.year}-${value.month}-${value.day}`;
}

/** "Mumbai, India" -> "mumbai"; the same rule as the server, so URLs and matching agree. */
export function slugifyPlace(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Occupancy in the URL form: rooms separated by "|", each "adults" plus optional "-age.age". */
export function formatOccupancy(rooms) {
  return rooms.map((room) => `${room.adults}${room.childAges.length ? `-${room.childAges.join('.')}` : ''}`).join('|');
}

export function parseOccupancy(value) {
  if (!value) return [{ adults: 2, childAges: [] }];
  const segments = String(value).split('|');
  if (segments.length > LIMITS.maxRooms) return null;
  const rooms = [];
  for (const segment of segments) {
    const [adultsPart, agesPart = ''] = segment.split('-');
    if (!/^\d+$/.test(adultsPart)) return null;
    const adults = Number(adultsPart);
    if (adults < LIMITS.minAdults || adults > LIMITS.maxAdults) return null;
    const childAges = agesPart === '' ? [] : agesPart.split('.').map(Number);
    if (childAges.length > LIMITS.maxChildrenPerRoom) return null;
    if (childAges.some((age) => !Number.isInteger(age) || age < LIMITS.minAge || age > LIMITS.maxAge)) return null;
    rooms.push({ adults, childAges });
  }
  return rooms;
}

/** Comma list with only values that pass `isValid`. Empty results become undefined (no filter). */
const csvList = (value, isValid) => {
  if (!value) return undefined;
  const items = [...new Set(value.split(',').map((v) => v.trim()).filter(Boolean))];
  const valid = items.filter((item) => isValid(item));
  return valid.length ? valid : undefined;
};

const oneOf = (values) => (item) => values.includes(item);
const AMENITY_CODE = /^[A-Z][A-Z0-9_]{1,40}$/;
const COUPON_CODE = /^[A-Z0-9_-]{3,40}$/;

function dinnerOnly(mealPlans) {
  if (!mealPlans) return undefined;
  const kept = mealPlans.filter((plan) => DINNER_INCLUDED_MEAL_PLANS.includes(plan));
  return kept.length ? kept : undefined;
}

/**
 * Reads the URL into a search state. Unknown or invalid values fall back to safe defaults rather than
 * producing an error page: the URL is user-editable and the results always reflect what is shown.
 */
export function parseSearchParams(params) {
  const get = (key) => (typeof params.get === 'function' ? params.get(key) : params[key]);
  const checkIn = isIsoDate(get('checkIn')) ? get('checkIn') : null;
  const checkOut = isIsoDate(get('checkOut')) ? get('checkOut') : null;
  const occupancy = parseOccupancy(get('occ')) ?? [{ adults: 2, childAges: [] }];
  const sort = SORTS.includes(get('sort')) ? get('sort') : 'recommended';
  const page = Math.max(1, Math.min(500, Number.parseInt(get('page') ?? '1', 10) || 1));

  const num = (key) => {
    const raw = get(key);
    if (raw == null || raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
  };
  const minPrice = num('minPrice');
  const maxPrice = num('maxPrice');
  const guestRating = [3.5, 4, 4.5].includes(Number(get('guestRating'))) ? Number(get('guestRating')) : undefined;
  const stars = csvList(get('stars'), oneOf(['1', '2', '3', '4', '5']))?.map(Number).sort((a, b) => a - b);

  return {
    destination: slugifyPlace(get('destination') ?? '') || null,
    area: slugifyPlace(get('area') ?? '') || null,
    name: String(get('name') ?? '').trim().slice(0, 120) || null,
    coupon: COUPON_CODE.test(String(get('coupon') ?? '').toUpperCase())
      ? String(get('coupon')).toUpperCase()
      : null,
    checkIn,
    checkOut,
    occupancy,
    sort,
    page,
    filters: {
      minPrice: minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice ? undefined : minPrice,
      maxPrice: minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice ? undefined : maxPrice,
      stars,
      guestRating,
      propertyTypes: csvList(get('propertyTypes'), (code) => PROPERTY_TYPE_CODE.test(code)),
      amenities: csvList(get('amenities'), (code) => AMENITY_CODE.test(code)),
      freeCancellation: get('freeCancellation') === 'true',
      mealPlans: dinnerOnly(csvList(get('mealPlans'), oneOf(MEAL_PLANS))),
    },
  };
}

/** The inverse of parseSearchParams. Empty filters are omitted so URLs stay short and shareable. */
export function toSearchParams(state, { includeCoupon = true } = {}) {
  const params = new URLSearchParams();
  if (state.checkIn) params.set('checkIn', state.checkIn);
  if (state.checkOut) params.set('checkOut', state.checkOut);
  if (state.occupancy) params.set('occ', formatOccupancy(state.occupancy));
  if (state.sort && state.sort !== 'recommended') params.set('sort', state.sort);
  if (state.page && state.page > 1) params.set('page', String(state.page));
  if (state.name) params.set('name', String(state.name).trim().slice(0, 120));
  const f = state.filters ?? {};
  if (f.minPrice != null) params.set('minPrice', String(f.minPrice));
  if (f.maxPrice != null) params.set('maxPrice', String(f.maxPrice));
  if (f.stars?.length) params.set('stars', [...f.stars].sort().join(','));
  if (f.guestRating) params.set('guestRating', String(f.guestRating));
  if (f.propertyTypes?.length) params.set('propertyTypes', f.propertyTypes.join(','));
  if (f.amenities?.length) params.set('amenities', [...f.amenities].sort().join(','));
  if (f.freeCancellation) params.set('freeCancellation', 'true');
  if (f.mealPlans?.length) params.set('mealPlans', f.mealPlans.join(','));
  if (includeCoupon && state.coupon) params.set('coupon', state.coupon);
  return params;
}

/** Search-level params (dates and occupancy) for links to a hotel or a destination. */
export function stayParams(state) {
  const params = new URLSearchParams();
  if (state.checkIn) params.set('checkIn', state.checkIn);
  if (state.checkOut) params.set('checkOut', state.checkOut);
  if (state.occupancy) params.set('occ', formatOccupancy(state.occupancy));
  if (state.coupon) params.set('coupon', state.coupon);
  return params;
}

/** Direct results-page link for destination cards, using the same default stay as the main search form. */
export function destinationSearchPath(destination, now = new Date(), extras = {}) {
  const today = todayIso(now);
  const params = stayParams({
    checkIn: addDays(today, 1),
    checkOut: addDays(today, 3),
    occupancy: [{ adults: 2, childAges: [] }],
    coupon: extras.coupon,
  });
  const destinationSlug = slugifyPlace(destination);
  if (destinationSlug) params.set('destination', destinationSlug);
  if (extras.propertyTypes?.length) params.set('propertyTypes', extras.propertyTypes.join(','));
  return `/hotels?${params}`;
}

export function summarizeOccupancy(rooms) {
  const roomCount = rooms.length;
  const adults = rooms.reduce((sum, r) => sum + r.adults, 0);
  const children = rooms.reduce((sum, r) => sum + r.childAges.length, 0);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return `${plural(roomCount, 'Room')} · ${plural(adults, 'Adult')}${children ? ` · ${plural(children, 'Child')}` : ''}`;
}

/** Stay validity used by the search widget and the details page before any request is made. */
export function validateStay({ checkIn, checkOut }, today) {
  if (!isIsoDate(checkIn)) return 'Choose a check-in date';
  if (!isIsoDate(checkOut)) return 'Choose a check-out date';
  if (checkIn < today) return 'Check-in cannot be in the past';
  if (checkOut <= checkIn) return 'Check-out must be after check-in';
  if (nightsBetween(checkIn, checkOut) > LIMITS.maxNights) return `Stays can be at most ${LIMITS.maxNights} nights`;
  return null;
}
