import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStarRating, normalizePropertyType, normalizeCountryCode, normalizeRegion } from '../../src/normalizers/hotelFields.js';
import { normalizeAmenities } from '../../src/normalizers/amenities.js';
import { normalizeHotel, normalizeImageCategory } from '../../src/normalizers/hotelNormalizer.js';
import { matchConfidence } from '../../src/normalizers/matching.js';
import { normalizePhone, normalizeWebsite, normalizeCoordinates } from '../../src/normalizers/primitives.js';
import { getPublishBlockers } from '../../src/domain/hotelPublishRules.js';
import { resolveTransition } from '../../src/domain/hotelStatus.js';
import { canTransition } from '../../src/domain/bookingStatus.js';
import { slugify } from '../../src/utils/slug.js';

test('star ratings from the formats admins and providers actually send', () => {
  assert.equal(normalizeStarRating('5 Star Hotel'), 5);
  assert.equal(normalizeStarRating('5-star'), 5);
  assert.equal(normalizeStarRating('★★★★★'), 5);
  assert.equal(normalizeStarRating('4-star'), 4);
  assert.equal(normalizeStarRating('five star'), 5);
  assert.equal(normalizeStarRating('5.0'), 5);
  assert.equal(normalizeStarRating(3), 3);
});

test('star ratings reject values that are not ratings', () => {
  assert.equal(normalizeStarRating('3 km from the airport'), null);
  assert.equal(normalizeStarRating('6 star'), null);
  assert.equal(normalizeStarRating(''), null);
  assert.equal(normalizeStarRating(null), null);
  assert.equal(normalizeStarRating(2.5), null);
});

test('property type maps free text and defaults to HOTEL', () => {
  assert.equal(normalizePropertyType('Beach Resort').value, 'RESORT');
  assert.equal(normalizePropertyType('Serviced Apartment').value, 'APARTMENT');
  assert.equal(normalizePropertyType('B&B').value, 'GUEST_HOUSE');
  assert.equal(normalizePropertyType('Mystery place').value, 'HOTEL');
});

test('country names and codes resolve to ISO alpha-2', () => {
  assert.equal(normalizeCountryCode('India'), 'IN');
  assert.equal(normalizeCountryCode('United Kingdom'), 'GB');
  assert.equal(normalizeCountryCode('IN'), 'IN');
  assert.equal(normalizeCountryCode('Atlantis'), null);
  assert.equal(normalizeCountryCode('Anything', 'fr'), 'FR');
});

test('region names drop state and province suffixes', () => {
  assert.equal(normalizeRegion('Maharashtra State'), 'Maharashtra');
  assert.equal(normalizeRegion('  Goa  '), 'Goa');
});

test('amenity synonyms collapse to canonical codes and unknown labels are reported', () => {
  const { codes, unmapped } = normalizeAmenities([
    'Free WiFi',
    'Wifi',
    'Wireless Internet',
    'Internet Access',
    'Swimming Pool',
    'Fitness Centre',
    'Kitchen',
  ]);
  assert.deepEqual(codes.sort(), ['GYM', 'POOL', 'WIFI']);
  assert.deepEqual(unmapped, ['Kitchen']);
});

test('image categories map provider labels and fall back to OTHER', () => {
  assert.equal(normalizeImageCategory('Lobby area'), 'LOBBY');
  assert.equal(normalizeImageCategory('Swimming pool'), 'POOL');
  assert.equal(normalizeImageCategory('Bathroom'), 'BATHROOM');
  assert.equal(normalizeImageCategory('Parking lot'), 'OTHER');
});

test('phone, website and coordinates are validated, not passed through', () => {
  assert.equal(normalizePhone('+91 22 6665 3300'), '+912266653300');
  assert.equal(normalizePhone('abc'), null);
  assert.equal(normalizeWebsite('tajhotels.com'), 'https://tajhotels.com/');
  assert.equal(normalizeWebsite('javascript:alert(1)'), null);
  assert.deepEqual(normalizeCoordinates('0', '0'), { latitude: null, longitude: null });
  assert.deepEqual(normalizeCoordinates(95, 10), { latitude: null, longitude: null });
});

test('normalizeHotel produces the Gokaasa shape and lists what is still missing', () => {
  const result = normalizeHotel({
    name: '  TAJ   LANDS END ',
    city: 'mumbai',
    country: 'india',
    address: 'Bandra West',
    latitude: '19.05',
    longitude: '72.82',
    starRating: '5 Star Hotel',
    propertyType: 'Hotel',
    amenities: ['Free WiFi', 'Swimming Pool'],
    images: [
      { url: 'https://example.com/a.jpg', category: 'Exterior' },
      { url: 'http://insecure.example.com/b.jpg', category: 'Lobby' },
    ],
  });

  assert.equal(result.hotel.name, 'Taj Lands End');
  assert.equal(result.hotel.city, 'Mumbai');
  assert.equal(result.hotel.countryCode, 'IN');
  assert.equal(result.hotel.starRating, 5);
  assert.equal(result.images.length, 1, 'non-https image URLs are dropped');
  assert.equal(result.images[0].category, 'EXTERIOR');
  assert.ok(result.missing.includes('description'));
  assert.ok(!result.missing.includes('starRating'));
});

test('match confidence ranks the right property above unrelated results', () => {
  const exact = matchConfidence({ query: 'Taj Lands End Mumbai', name: 'Taj Lands End', city: 'Mumbai', state: 'Maharashtra' });
  const loose = matchConfidence({ query: 'Taj Lands End Mumbai', name: 'Lands Inn', city: 'Pune', state: 'Maharashtra' });
  const unrelated = matchConfidence({ query: 'Taj Lands End Mumbai', name: 'Red Desert Lodge', city: 'Jaipur', state: 'Rajasthan' });
  assert.ok(exact > loose, `${exact} should beat ${loose}`);
  assert.ok(loose > unrelated, `${loose} should beat ${unrelated}`);
  assert.ok(exact >= 90);
});

test('publish blockers list every missing requirement', () => {
  const blockers = getPublishBlockers(
    { name: 'A', addressLine: null, city: 'Goa', countryCode: 'IN', latitude: null, longitude: null, description: null, starRating: null },
    { imageCount: 0, amenityCount: 0 },
  );
  assert.deepEqual(blockers, ['Address', 'Map location', 'Description', 'Star rating', 'At least one image', 'At least one amenity']);
});

test('hotel status machine rejects skipped steps', () => {
  assert.equal(resolveTransition('DRAFT', 'PUBLISH'), null, 'draft cannot go straight to published');
  assert.equal(resolveTransition('DRAFT', 'SUBMIT_FOR_REVIEW'), 'PENDING_REVIEW');
  assert.equal(resolveTransition('PENDING_REVIEW', 'MARK_READY'), 'READY_TO_PUBLISH');
  assert.equal(resolveTransition('READY_TO_PUBLISH', 'PUBLISH'), 'PUBLISHED');
  assert.equal(resolveTransition('PUBLISHED', 'UNPUBLISH'), 'UNPUBLISHED');
  assert.equal(resolveTransition('ARCHIVED', 'PUBLISH'), null);
});

test('booking state machine blocks invalid transitions', () => {
  assert.equal(canTransition('INITIATED', 'CONFIRMED'), false, 'confirmation requires payment');
  assert.equal(canTransition('PAID', 'CONFIRMED'), true);
  assert.equal(canTransition('REFUNDED', 'CONFIRMED'), false);
});

test('slugs are url-safe and ascii', () => {
  assert.equal(slugify('Taj Lands End', 'Mumbai'), 'taj-lands-end-mumbai');
  assert.equal(slugify('Café & Stay!', 'São Paulo'), 'cafe-and-stay-sao-paulo');
});
