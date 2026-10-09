/**
 * Derives the strikethrough-price/discount-badge values from a hotel card's own `bestOffer`, which
 * already carries everything needed (baseTotalMinor, discountTotalMinor, nights) -- this never invents a
 * discount the backend didn't compute, it only reshapes the same numbers for display.
 */
export function discountDisplay(offer) {
  const hasDiscount = Boolean(offer?.discountTotalMinor > 0);
  if (!hasDiscount) return { hasDiscount: false, originalPerNightMinor: null, discountPercent: null };
  return {
    hasDiscount: true,
    originalPerNightMinor: Math.round(offer.baseTotalMinor / offer.nights),
    discountPercent: Math.round((offer.discountTotalMinor / offer.baseTotalMinor) * 100),
  };
}
