/** Small, pure helpers shared by the hotel normalizers. */

export function cleanText(value, maxLength = 2000) {
  if (typeof value !== 'string') return null;
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (!collapsed) return null;
  return collapsed.slice(0, maxLength);
}

/** Title-cases words but keeps short all-caps abbreviations such as "NCR" or "UK" untouched. */
export function titleCase(value) {
  const cleaned = cleanText(value, 120);
  if (!cleaned) return null;
  return cleaned
    .toLowerCase()
    .replace(/(^|[\s\-/(])([a-z])/g, (_match, boundary, letter) => boundary + letter.toUpperCase());
}

export function normalizePostalCode(value) {
  const cleaned = cleanText(value, 20);
  if (!cleaned) return null;
  return cleaned.toUpperCase().replace(/[^A-Z0-9 -]/g, '') || null;
}

/** Keeps digits and a leading plus; returns null when too few digits remain to be a phone number. */
export function normalizePhone(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

export function normalizeEmail(value) {
  const cleaned = cleanText(value, 254)?.toLowerCase();
  if (!cleaned) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) ? cleaned : null;
}

export function normalizeWebsite(value) {
  const cleaned = cleanText(value, 500);
  if (!cleaned) return null;
  const withProtocol = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
  try {
    const url = new URL(withProtocol);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { latitude: null, longitude: null };
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { latitude: null, longitude: null };
  // (0, 0) is the default for many datasets when the location is unknown.
  if (lat === 0 && lng === 0) return { latitude: null, longitude: null };
  return { latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) };
}

/** Lowercase token set with punctuation and common filler words removed, used for matching. */
export function tokenize(value) {
  const stopWords = new Set(['the', 'hotel', 'and', 'of', 'a', 'an', 'in', 'at', 'by']);
  return new Set(
    (cleanText(value, 300) ?? '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token && !stopWords.has(token)),
  );
}
