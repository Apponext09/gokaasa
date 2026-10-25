const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

function countryName(hotel) {
  if (hotel?.country) return hotel.country;
  if (!hotel?.countryCode) return null;
  try {
    return regionNames.of(hotel.countryCode);
  } catch {
    return hotel.countryCode;
  }
}

/** Keeps hotel locations consistent while allowing cards to use a deliberately shorter form. */
export function formatHotelLocation(hotel, { compact = false } = {}) {
  const parts = compact
    ? [hotel?.area, hotel?.city]
    : [hotel?.addressLine, hotel?.area, hotel?.city, hotel?.state, countryName(hotel)];

  const seen = new Set();
  return parts
    .map((part) => String(part ?? '').trim())
    .filter((part) => {
      if (!part) return false;
      const key = part.toLocaleLowerCase('en-IN');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(', ');
}
