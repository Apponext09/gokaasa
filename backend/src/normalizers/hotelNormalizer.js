import { normalizeAmenities } from './amenities.js';
import {
  normalizeCountryCode,
  normalizePropertyType,
  normalizeRegion,
  normalizeStarRating,
} from './hotelFields.js';
import {
  cleanText,
  normalizeCoordinates,
  normalizeEmail,
  normalizePhone,
  normalizePostalCode,
  normalizeWebsite,
  titleCase,
} from './primitives.js';

const IMAGE_CATEGORY_RULES = [
  [/exterior|facade|front|outside|building|cover|hero|main|primary/i, 'EXTERIOR'],
  [/lobby|reception|entrance/i, 'LOBBY'],
  [/bath/i, 'BATHROOM'],
  [/room|suite|bed/i, 'ROOM'],
  [/restaurant|dining|food|breakfast/i, 'RESTAURANT'],
  [/pool/i, 'POOL'],
  [/gym|fitness/i, 'GYM'],
  [/spa|wellness/i, 'SPA'],
];

/** Raw provider values keyed by tracked field, used to decide whether normalisation changed a value. */
export function rawFieldValues(raw) {
  return {
    name: raw.name ?? null,
    shortName: null,
    description: raw.description ?? null,
    propertyType: raw.propertyType ?? null,
    starRating: raw.starRating ?? null,
    addressLine: raw.address ?? null,
    area: null,
    city: raw.city ?? null,
    state: raw.state ?? null,
    countryCode: raw.countryCode ?? raw.country ?? null,
    postalCode: raw.postalCode ?? null,
    latitude: raw.latitude ?? null,
    longitude: raw.longitude ?? null,
    phone: raw.phone ?? null,
    email: raw.email ?? null,
    website: raw.website ?? null,
  };
}

export function normalizeImageCategory(raw) {
  const text = cleanText(raw, 80);
  if (!text) return 'OTHER';
  for (const [pattern, category] of IMAGE_CATEGORY_RULES) {
    if (pattern.test(text)) return category;
  }
  return 'OTHER';
}

/** Only https URLs are stored. Anything else is dropped rather than rendered in the admin UI. */
function normalizeImageUrl(url) {
  const cleaned = cleanText(url, 2000);
  if (!cleaned) return null;
  try {
    const parsed = new URL(cleaned);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Converts one provider-specific hotel record into the Gokaasa hotel shape.
 * Anything that cannot be normalised becomes `null` plus an entry in `missing`/`warnings`,
 * so an admin sees exactly what is incomplete. Nothing here publishes data.
 *
 * @param {object} raw  ExternalHotelRecord (see providers/hotelDataProvider.js)
 */
export function normalizeHotel(raw) {
  const warnings = [];
  const name = titleCase(raw.name) ?? cleanText(raw.name, 200);
  const city = titleCase(raw.city);
  const countryCode = normalizeCountryCode(raw.country, raw.countryCode);
  const { latitude, longitude } = normalizeCoordinates(raw.latitude, raw.longitude);
  const starRating = normalizeStarRating(raw.starRating);
  const propertyType = normalizePropertyType(raw.propertyType ?? raw.name);
  const { codes: amenityCodes, unmapped: unmappedAmenities } = normalizeAmenities(raw.amenities ?? []);

  if (raw.starRating != null && starRating == null) warnings.push(`Could not read star rating "${raw.starRating}"`);
  if (raw.country && !countryCode) warnings.push(`Unknown country "${raw.country}"`);
  if (unmappedAmenities.length > 0) warnings.push(`${unmappedAmenities.length} amenity label(s) were not recognised`);

  const images = (raw.images ?? [])
    .map((image, index) => {
      const sourceUrl = normalizeImageUrl(image.url);
      if (!sourceUrl) return null;
      return {
        category: normalizeImageCategory(image.category),
        sourceUrl,
        altText: cleanText(image.altText ?? name, 200),
        sortOrder: index,
        isCover: false, // a cover is never chosen by the importer
      };
    })
    .filter(Boolean)
    .slice(0, 30);

  const hotel = {
    name,
    shortName: name && name.length > 40 ? null : name,
    description: cleanText(raw.description, 4000),
    propertyType: propertyType.value,
    starRating,
    guestRating: raw.guestRating != null && raw.guestRating >= 0 && raw.guestRating <= 5
      ? Number(Number(raw.guestRating).toFixed(1))
      : null,
    reviewCount: Number.isInteger(raw.reviewCount) && raw.reviewCount >= 0 ? raw.reviewCount : 0,
    addressLine: cleanText(raw.address, 300),
    area: titleCase(raw.area),
    city,
    state: normalizeRegion(raw.state),
    countryCode,
    postalCode: normalizePostalCode(raw.postalCode),
    latitude,
    longitude,
    phone: normalizePhone(raw.phone),
    email: normalizeEmail(raw.email),
    website: normalizeWebsite(raw.website),
  };

  const missing = [];
  if (!hotel.name) missing.push('name');
  if (!hotel.city) missing.push('city');
  if (!hotel.countryCode) missing.push('countryCode');
  if (!hotel.addressLine) missing.push('addressLine');
  if (hotel.latitude == null) missing.push('location');
  if (!hotel.description) missing.push('description');
  if (hotel.starRating == null) missing.push('starRating');
  if (images.length === 0) missing.push('images');
  if (amenityCodes.length === 0) missing.push('amenities');

  return {
    hotel,
    amenityCodes,
    unmappedAmenities,
    images,
    missing,
    warnings,
  };
}
