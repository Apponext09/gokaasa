/**
 * Derives comparable before-tax nightly prices from a hotel card's own `bestOffer`. The API's
 * `pricePerNightMinor` is the final total (including taxes and fees) averaged across the stay, while
 * `baseTotalMinor` is before tax. Comparing those two made a discounted price appear higher than its
 * crossed-out price. Both values returned here use the same before-tax basis.
 */
export function discountDisplay(offer) {
  const nights = Number(offer?.nights);
  const baseTotalMinor = Number(offer?.baseTotalMinor);
  const discountTotalMinor = Number(offer?.discountTotalMinor);
  if (!Number.isFinite(nights) || nights <= 0 || !Number.isFinite(baseTotalMinor)) {
    return {
      hasDiscount: false,
      pricePerNightMinor: offer?.pricePerNightMinor ?? null,
      originalPerNightMinor: null,
      discountPercent: null,
    };
  }

  const hasDiscount = Boolean(offer?.discountTotalMinor > 0);
  return {
    hasDiscount,
    pricePerNightMinor: Math.round((baseTotalMinor - (hasDiscount ? discountTotalMinor : 0)) / nights),
    originalPerNightMinor: hasDiscount ? Math.round(baseTotalMinor / nights) : null,
    discountPercent: hasDiscount ? Math.round((discountTotalMinor / baseTotalMinor) * 100) : null,
  };
}
