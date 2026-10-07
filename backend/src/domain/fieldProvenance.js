/**
 * Field provenance and verification rules. Everything that decides whether a provider value may
 * overwrite Gokaasa data lives here, so the API and the admin UI cannot disagree.
 */

// camelCase input field -> snake_case column. Shared by create, update and the import pipeline.
export const COLUMN_FOR = {
  name: 'name',
  shortName: 'short_name',
  description: 'description',
  propertyType: 'property_type',
  starRating: 'star_rating',
  addressLine: 'address_line',
  area: 'area',
  city: 'city',
  state: 'state',
  countryCode: 'country_code',
  postalCode: 'postal_code',
  latitude: 'latitude',
  longitude: 'longitude',
  phone: 'phone',
  email: 'email',
  website: 'website',
  checkInTime: 'check_in_time',
  checkOutTime: 'check_out_time',
};

/** Fields that come from providers and are therefore tracked, verified and synced. */
export const TRACKED_FIELDS = Object.freeze([
  'name',
  'shortName',
  'description',
  'propertyType',
  'starRating',
  'addressLine',
  'area',
  'city',
  'state',
  'countryCode',
  'postalCode',
  'latitude',
  'longitude',
  'phone',
  'email',
  'website',
]);

export const SOURCE = Object.freeze({
  EXTERNAL: 'EXTERNAL', // provider value stored exactly as received
  NORMALIZED: 'NORMALIZED', // provider value changed by Gokaasa normalisation
  MANUALLY_MODIFIED: 'MANUALLY_MODIFIED', // an admin changed the value
});

export const FIELD_STATUS = Object.freeze({
  IMPORTED: 'IMPORTED',
  MODIFIED: 'MODIFIED',
  MISSING: 'MISSING',
  VERIFIED: 'VERIFIED',
});

/** Fields the publish gate needs. Only these are reported as Missing; optional blanks stay quiet. */
export const PUBLISH_REQUIRED_FIELDS = Object.freeze(['name', 'addressLine', 'city', 'countryCode', 'latitude', 'longitude', 'description', 'starRating']);

export function isEmptyValue(value) {
  return value == null || String(value).trim() === '';
}

/** Canonical string form used for comparing values regardless of their Postgres/JS type. */
export function canonical(value) {
  if (isEmptyValue(value)) return '';
  return typeof value === 'number' ? String(value) : String(value).trim();
}

export function sameValue(a, b) {
  return canonical(a) === canonical(b);
}

/** Chooses EXTERNAL when the normalised value equals the raw provider value, otherwise NORMALIZED. */
export function importSourceFor(rawValue, normalizedValue) {
  return sameValue(rawValue, normalizedValue) ? SOURCE.EXTERNAL : SOURCE.NORMALIZED;
}

/**
 * A provider value may only be applied automatically when Gokaasa has not touched the field and
 * no admin has verified it. Untracked fields (no provenance row) are protected by default.
 */
export function isProtected(provenance) {
  if (!provenance) return true;
  return provenance.source === SOURCE.MANUALLY_MODIFIED || Boolean(provenance.verified_at);
}

/**
 * @param {unknown} value current value on the hotel
 * @param {object|undefined} provenance hotel_field_states row, if any
 * @returns {{status: string|null, source: string|null, externalValue: string|null,
 *            hasSuggestion: boolean, pendingExternalValue: string|null, verifiedAt: Date|null}}
 */
export function describeField(value, provenance, { required = false } = {}) {
  const base = {
    status: null,
    source: provenance?.source ?? null,
    externalValue: provenance?.external_value ?? null,
    hasSuggestion: Boolean(provenance?.pending_external_value),
    pendingExternalValue: provenance?.pending_external_value ?? null,
    verifiedAt: provenance?.verified_at ?? null,
  };

  if (isEmptyValue(value)) return { ...base, status: required ? FIELD_STATUS.MISSING : null };
  if (!provenance) return base; // manual hotel or untracked field: no badge
  if (provenance.verified_at) return { ...base, status: FIELD_STATUS.VERIFIED };
  if (provenance.source === SOURCE.MANUALLY_MODIFIED) return { ...base, status: FIELD_STATUS.MODIFIED };
  return { ...base, status: FIELD_STATUS.IMPORTED };
}
