/**
 * Requirements a hotel must meet before it can move to READY_TO_PUBLISH or PUBLISHED.
 * Imported data is treated as unverified until these are satisfied and an admin has reviewed it.
 *
 * @returns {string[]} human-readable blockers; an empty array means the hotel is publishable
 */
export function getPublishBlockers(hotel, { imageCount, amenityCount, hasCover = false }) {
  const blockers = [];
  if (!hotel.name) blockers.push('Hotel name');
  if (!hotel.addressLine) blockers.push('Address');
  if (!hotel.city) blockers.push('City');
  if (!hotel.countryCode) blockers.push('Country');
  if (hotel.latitude == null || hotel.longitude == null) blockers.push('Map location');
  if (!hotel.description) blockers.push('Description');
  if (hotel.starRating == null) blockers.push('Star rating');
  if (imageCount === 0) blockers.push('At least one image');
  // The cover is always an explicit choice. Gokaasa never promotes the first image automatically.
  else if (!hasCover) blockers.push('Cover image');
  if (amenityCount === 0) blockers.push('At least one amenity');
  return blockers;
}
