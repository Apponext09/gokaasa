/**
 * Shared by every hotel card (search results, curated/nearby carousels). A hotel can be tagged with the
 * same amenity more than once if it came from more than one provider, so this always dedupes first, then
 * caps the shown list and reports how many more there are -- never a silently-truncated or repeated list.
 */
export function normalizeAmenities(amenities = [], max = 3) {
  const unique = [...new Set(amenities)];
  return { shown: unique.slice(0, max), moreCount: Math.max(0, unique.length - max) };
}
