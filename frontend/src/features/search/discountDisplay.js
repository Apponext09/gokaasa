/**
 * Derives comparable before-tax nightly prices from a hotel card's own `bestOffer`. The API's
 * `pricePerNightMinor` and the values derived here share the same before-tax basis, so filtering,
 * sorting, the current price and the crossed-out price all describe the same amount.
 */
export function discountDisplay(offer) {
  const nights = Number(offer?.nights);
  const baseTotalMinor = Number(offer?.baseTotalMinor);
  const discountTotalMinor = Number(offer?.discountTotalMinor);
  if (!Number.isFinite(nights) || nights <= 0 || !Number.isFinite(baseTotalMinor)) {
    return {
      hasDiscount: false,
      ...(offer?.pricePerNightMinor != null ? { pricePerNightMinor: offer.pricePerNightMinor } : {}),
      originalPerNightMinor: null,
      discountPercent: null,
    };
  }

  const hasDiscount = Boolean(offer?.discountTotalMinor > 0);
  if (!hasDiscount) {
    return {
      hasDiscount: false,
      ...(offer?.pricePerNightMinor != null ? { pricePerNightMinor: offer.pricePerNightMinor } : {}),
      originalPerNightMinor: null,
      discountPercent: null,
    };
  }
  return {
    hasDiscount: true,
    pricePerNightMinor: Math.round((baseTotalMinor - discountTotalMinor) / nights),
    originalPerNightMinor: Math.round(baseTotalMinor / nights),
    discountPercent: Math.round((discountTotalMinor / baseTotalMinor) * 100),
  };
}
