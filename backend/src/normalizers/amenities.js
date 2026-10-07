/**
 * Maps the many spellings providers use for the same facility onto a canonical amenity code.
 * Codes must exist in the `amenities` table (see seeds/001_amenities.js).
 */
const RULES = [
  { code: 'WIFI', patterns: [/\bwi-?fi\b/, /wireless/, /internet access/, /\binternet\b/, /\bwlan\b/] },
  { code: 'POOL', patterns: [/\bpool\b/, /swimming/] },
  { code: 'PARKING', patterns: [/parking/, /\bgarage\b/, /valet/] },
  { code: 'RESTAURANT', patterns: [/restaurant/, /\bdining\b/, /in-house food/] },
  { code: 'BAR', patterns: [/\bbar\b/, /lounge/, /cocktail/] },
  { code: 'GYM', patterns: [/\bgym\b/, /fitness/, /fitness centre/] },
  { code: 'SPA', patterns: [/\bspa\b/, /wellness/] },
  { code: 'AC', patterns: [/air ?condition/, /\bac\b/, /\bhvac\b/] },
  { code: 'ROOM_SERVICE', patterns: [/room service/, /in-room dining/] },
  { code: 'BREAKFAST', patterns: [/breakfast/] },
  { code: 'AIRPORT_SHUTTLE', patterns: [/airport (shuttle|transfer|pickup|pick-up)/] },
  { code: 'LAUNDRY', patterns: [/laundry/, /dry clean/] },
  { code: 'PETS_ALLOWED', patterns: [/pets? (allowed|friendly)/, /\bpet-friendly\b/] },
  { code: 'WHEELCHAIR_ACCESS', patterns: [/wheelchair/, /accessible/] },
  { code: 'FRONT_DESK_24H', patterns: [/24.?h(our)? (front desk|reception)/, /24-hour (front desk|reception)/] },
  { code: 'CONFERENCE_ROOM', patterns: [/conference/, /meeting room/, /business centre/, /business center/] },
  { code: 'BEACH_ACCESS', patterns: [/beach/] },
  { code: 'KIDS_CLUB', patterns: [/kids? ?club/, /children'?s club/] },
];

export function normalizeAmenityLabel(label) {
  if (typeof label !== 'string') return null;
  const text = label.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text) return null;
  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) return rule.code;
  }
  return null;
}

/**
 * Returns `{ codes, unmapped }`. Codes are de-duplicated; unmapped labels are kept so admins can see
 * what the provider sent that Gokaasa does not recognise yet.
 */
export function normalizeAmenities(labels = []) {
  const codes = new Set();
  const unmapped = [];
  for (const label of labels) {
    const code = normalizeAmenityLabel(label);
    if (code) codes.add(code);
    else if (typeof label === 'string' && label.trim()) unmapped.push(label.trim().slice(0, 80));
  }
  return { codes: [...codes], unmapped: [...new Set(unmapped)] };
}
