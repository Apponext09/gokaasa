import { cleanText } from './primitives.js';

const WORD_TO_NUMBER = { one: 1, two: 2, three: 3, four: 4, five: 5 };

/**
 * Accepts "5 Star Hotel", "5-star", "5*", "★★★★★", 5, "5.0", "five star" and returns 1-5, or null.
 */
export function normalizeStarRating(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
  }
  const text = cleanText(value, 60);
  if (!text) return null;

  const stars = (text.match(/★/g) ?? []).length;
  if (stars >= 1 && stars <= 5) return stars;

  const lower = text.toLowerCase();
  // Only accept a digit when it is clearly a rating ("5", "5.0", "5 star", "5-star", "5*"), so
  // distances like "3 km from the airport" are never mistaken for stars.
  const digitMatch = lower.match(/^(\d(?:\.\d)?)(?:\s*-?\s*(?:stars?|\*))?(?:\s+(?:hotel|star hotel|star))?$/)
    ?? lower.match(/^(\d(?:\.\d)?)\s*-?\s*star\b/);
  if (digitMatch) {
    const rounded = Math.round(Number(digitMatch[1]));
    if (rounded >= 1 && rounded <= 5) return rounded;
  }

  const wordMatch = lower.match(/\b(one|two|three|four|five)\b\s*-?\s*star/);
  if (wordMatch) return WORD_TO_NUMBER[wordMatch[1]];

  return null;
}

const PROPERTY_TYPE_RULES = [
  [/\bresort\b/, 'RESORT'],
  [/\bvilla\b/, 'VILLA'],
  [/\b(apartment|apart-hotel|serviced flat|flat)\b/, 'APARTMENT'],
  [/\b(hostel|backpacker)\b/, 'HOSTEL'],
  [/\b(guest ?house|guest ?inn|bed and breakfast|b&b|homestay|bnb)\b/, 'GUEST_HOUSE'],
];

/** Maps free-text property descriptions to the Gokaasa property type enum. Defaults to HOTEL. */
export function normalizePropertyType(value) {
  const text = cleanText(value, 120)?.toLowerCase();
  if (!text) return { value: 'HOTEL', matched: false };
  for (const [pattern, type] of PROPERTY_TYPE_RULES) {
    if (pattern.test(text)) return { value: type, matched: true };
  }
  return { value: 'HOTEL', matched: /\bhotel\b/.test(text) };
}

const COUNTRY_CODES = {
  india: 'IN',
  'united states': 'US',
  'united states of america': 'US',
  usa: 'US',
  'united kingdom': 'GB',
  uk: 'GB',
  'great britain': 'GB',
  england: 'GB',
  uae: 'AE',
  'united arab emirates': 'AE',
  singapore: 'SG',
  thailand: 'TH',
  indonesia: 'ID',
  malaysia: 'MY',
  france: 'FR',
  italy: 'IT',
  spain: 'ES',
  germany: 'DE',
  japan: 'JP',
  australia: 'AU',
  canada: 'CA',
  'sri lanka': 'LK',
  nepal: 'NP',
  maldives: 'MV',
  vietnam: 'VN',
  'south africa': 'ZA',
};

/** Returns an ISO 3166-1 alpha-2 code from a country name or code, or null when unknown. */
export function normalizeCountryCode(value, countryCodeHint) {
  const hint = cleanText(countryCodeHint, 4)?.toUpperCase();
  if (hint && /^[A-Z]{2}$/.test(hint)) return hint;

  const text = cleanText(value, 80);
  if (!text) return null;
  if (/^[A-Za-z]{2}$/.test(text)) return text.toUpperCase();
  return COUNTRY_CODES[text.toLowerCase()] ?? null;
}

/** Removes trailing "State" and "Province" wording so "Maharashtra State" and "Maharashtra" match. */
export function normalizeRegion(value) {
  const text = cleanText(value, 120);
  if (!text) return null;
  return text.replace(/\s+(state|province|region)$/i, '').trim() || null;
}
