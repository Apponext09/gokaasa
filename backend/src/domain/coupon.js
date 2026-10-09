/**
 * Coupon discount math and eligibility rules. Pure and database-free: the service layer resolves
 * everything that needs a query (usage counts, hotel/destination membership, prior-booking history)
 * into plain values and booleans before calling these, so the rules themselves stay unit-testable and
 * the actual money math lives in exactly one place.
 */

export const DISCOUNT_TYPE = Object.freeze({ PERCENT: 'PERCENT', FIXED: 'FIXED' });
export const CUSTOMER_ELIGIBILITY = Object.freeze({ ALL: 'ALL', NEW_CUSTOMERS: 'NEW_CUSTOMERS' });

/**
 * The discount a coupon is worth against `baseAmountMinor` (the hold's total before this coupon).
 * Never negative, never more than the base amount itself -- a coupon can discount a stay to zero, never
 * below it.
 */
export function discountFor(coupon, baseAmountMinor) {
  const base = Number(baseAmountMinor);
  const raw = coupon.discount_type === DISCOUNT_TYPE.PERCENT
    ? Math.round((base * Number(coupon.discount_value)) / 100)
    : Number(coupon.discount_value);
  const capped = coupon.max_discount_minor != null ? Math.min(raw, Number(coupon.max_discount_minor)) : raw;
  return Math.max(0, Math.min(capped, base));
}

/**
 * Every reason this coupon cannot be applied right now, given facts the caller has already resolved.
 * An empty array means it is eligible. `context`:
 *   now                  - Date, the moment to check valid_from/valid_to against
 *   totalMinor           - the hold's total before this coupon (checked against min_amount_minor)
 *   nights                - the stay's night count (checked against min_nights)
 *   checkIn, checkOut     - the stay's dates (checked against stay_from/stay_to, when set)
 *   isNewCustomer         - whether this user has no prior CONFIRMED/PAID booking
 *   hotelAllowed          - false only when the coupon has hotel restrictions that exclude this hotel
 *   destinationAllowed    - false only when the coupon has destination restrictions that exclude this city
 *   usageLimitReached     - coupon-wide usage_limit already met (PENDING + CONFIRMED together)
 *   perUserLimitReached   - this user's own per_user_limit already met
 */
export function eligibilityErrors(coupon, context) {
  const errors = [];
  if (!coupon.is_active) errors.push('This coupon is no longer active.');
  if (context.now < new Date(coupon.valid_from)) errors.push('This coupon is not valid yet.');
  if (context.now > new Date(coupon.valid_to)) errors.push('This coupon has expired.');
  if (context.usageLimitReached) errors.push('This coupon has reached its usage limit.');
  if (context.perUserLimitReached) errors.push('You have already used this coupon the maximum number of times.');
  if (Number(context.totalMinor) < Number(coupon.min_amount_minor)) {
    errors.push(`This coupon needs a minimum booking amount of ${(Number(coupon.min_amount_minor) / 100).toFixed(2)}.`);
  }
  if (coupon.min_nights != null && context.nights < coupon.min_nights) {
    errors.push(`This coupon needs a stay of at least ${coupon.min_nights} night(s).`);
  }
  if (coupon.stay_from != null && context.checkIn < coupon.stay_from) errors.push('This coupon does not apply to these stay dates.');
  if (coupon.stay_to != null && context.checkOut > addDay(coupon.stay_to)) errors.push('This coupon does not apply to these stay dates.');
  if (coupon.customer_eligibility === CUSTOMER_ELIGIBILITY.NEW_CUSTOMERS && !context.isNewCustomer) {
    errors.push('This coupon is only valid for new customers.');
  }
  if (context.hotelAllowed === false) errors.push('This coupon is not valid for this hotel.');
  if (context.destinationAllowed === false) errors.push('This coupon is not valid for this destination.');
  return errors;
}

/** stay_to is a date (the last night), so checkOut (exclusive) may equal the day after it. */
function addDay(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The best openly-advertisable discount among `coupons` for one hotel card, given its own real price.
 * This drives the "X% OFF" badge shown on search/homepage cards -- never a guarantee, since it
 * deliberately skips rules that can only be confirmed for a known shopper:
 *   - CUSTOMER_ELIGIBILITY.NEW_CUSTOMERS and per_user_limit are skipped entirely. A card is shown to
 *     anyone, logged in or not, so "is this person a new customer" / "how many times have they already
 *     used this code" cannot be answered here. The real checkout flow (applyToHold/applicableForHold)
 *     still re-validates these -- this is a general teaser, not the authoritative eligibility check.
 *   - usage_limit (global) is already enforced by the caller via couponRepository.listActive().
 *   - min_nights / stay_from / stay_to are only evaluated when a real stay is known (context.nights and
 *     context.checkIn/checkOut are non-null, i.e. search-results cards). A homepage teaser card with no
 *     stay context skips any coupon carrying those restrictions rather than risk an unconfirmed claim.
 *
 * `coupons` must already be pre-filtered to active + in valid-date-range (couponRepository.listActive)
 * and each must carry `hotel_ids`/`cities` (couponRepository.restrictionsFor). Returns null when nothing
 * safely qualifies, or when `context.subtotalMinor` is not a real, positive amount (no price, no badge).
 */
export function bestDisplayOffer(coupons, context) {
  const subtotalMinor = Number(context.subtotalMinor);
  if (!Number.isFinite(subtotalMinor) || subtotalMinor <= 0) return null;

  let best = null;
  for (const coupon of coupons) {
    if (coupon.customer_eligibility === CUSTOMER_ELIGIBILITY.NEW_CUSTOMERS) continue;
    if (coupon.per_user_limit != null) continue;

    const hotelIds = coupon.hotel_ids ?? [];
    const cities = coupon.cities ?? [];
    const hotelAllowed = hotelIds.length === 0 || hotelIds.includes(context.hotelId);
    const destinationAllowed = cities.length === 0 || (context.city != null && cities.some((c) => c.toLowerCase() === context.city.toLowerCase()));
    if (!hotelAllowed || !destinationAllowed) continue;

    if (subtotalMinor < Number(coupon.min_amount_minor)) continue;

    if (coupon.min_nights != null) {
      if (context.nights == null || context.nights < coupon.min_nights) continue;
    }
    if (coupon.stay_from != null || coupon.stay_to != null) {
      if (context.checkIn == null || context.checkOut == null) continue;
      if (coupon.stay_from != null && context.checkIn < coupon.stay_from) continue;
      if (coupon.stay_to != null && context.checkOut > addDay(coupon.stay_to)) continue;
    }

    const discountMinor = discountFor(coupon, subtotalMinor);
    if (discountMinor <= 0) continue;
    if (!best || discountMinor > best.discountMinor) {
      best = { code: coupon.code, discountMinor, discountPercent: Math.round((discountMinor / subtotalMinor) * 100) };
    }
  }
  return best;
}
