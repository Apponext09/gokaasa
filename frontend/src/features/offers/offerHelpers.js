/**
 * Pure helpers shared by every offer-discovery surface (search card badges, the hotel-details offers
 * section, the offer card itself). Kept dependency-free so they can be unit-tested directly, and so the
 * "does this offer apply to this hotel" rule is written exactly once.
 */

export function discountLabel(offer) {
  return offer.discountType === 'PERCENT' ? `${offer.discountValue}% OFF` : `₹${offer.discountValue.toLocaleString('en-IN')} OFF`;
}

export function formatValidUntil(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Whole days until the offer's validUntil, from the server's own timestamp. Negative once it has passed. */
export function daysUntilExpiry(iso, now = Date.now()) {
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
}

/**
 * True when an offer's hotel/destination restrictions (empty arrays mean "no restriction") allow this
 * hotel. Both dimensions must pass when both are set -- a coupon can be restricted by hotel AND by city
 * at once.
 */
export function hotelQualifiesForOffer(offer, hotel) {
  const hotelMatch = offer.hotels.length === 0 || offer.hotels.some((h) => h.id === hotel.id);
  const cityMatch = offer.destinations.length === 0 || (hotel.city != null && offer.destinations.some((c) => c.toLowerCase() === hotel.city.toLowerCase()));
  return hotelMatch && cityMatch;
}

/** Offers a hotel actually qualifies for, out of the full public list. */
export function offersForHotel(offers, hotel) {
  return offers.filter((offer) => hotelQualifiesForOffer(offer, hotel));
}

/**
 * A cheap per-hotel lookup for list pages with many cards, built once from the full offers list instead
 * of re-filtering it (or re-fetching it) for every card.
 */
export function buildOfferLookup(offers) {
  const unrestricted = offers.some((o) => o.hotels.length === 0 && o.destinations.length === 0);
  const hotelIds = new Set(offers.flatMap((o) => o.hotels.map((h) => h.id)));
  const cities = new Set(offers.flatMap((o) => o.destinations.map((c) => c.toLowerCase())));
  return { unrestricted, hotelIds, cities };
}

export function hasOfferFor(lookup, hotel) {
  return Boolean(lookup) && (lookup.unrestricted || lookup.hotelIds.has(hotel.id) || lookup.cities.has(hotel.city?.toLowerCase()));
}
