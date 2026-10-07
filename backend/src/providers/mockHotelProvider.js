import { HotelDataProvider, ProviderError } from './hotelDataProvider.js';
import { tokenize } from '../normalizers/primitives.js';

/**
 * Deterministic development data. Used only when no real provider is configured, so the onboarding
 * flow can be exercised end-to-end. Every record is clearly labelled as mock and uses generic names.
 */
const CATALOG = [
  {
    externalId: 'mock-1001',
    name: 'Sample Sea Breeze Hotel',
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'India',
    countryCode: 'IN',
    address: '12 Sample Road, Bandra West',
    area: 'Bandra West',
    latitude: 19.0596,
    longitude: 72.8295,
    starRating: '5 Star Hotel',
    propertyType: 'Hotel',
    guestRating: 4.7,
    reviewCount: 2345,
    amenities: ['Free WiFi', 'Swimming Pool', 'Parking', 'In-house Restaurant', 'Fitness Centre', 'Spa', 'Air Conditioning', 'Room Service', 'Breakfast Included'],
    description: 'Mock description for development. Replace with verified content before publishing.',
  },
  {
    externalId: 'mock-1002',
    name: 'Sample Harbour View Resort',
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'India',
    countryCode: 'IN',
    address: '4 Sample Coast Road, Colaba',
    area: 'Colaba',
    latitude: 18.9217,
    longitude: 72.8332,
    starRating: '★★★★★',
    propertyType: 'Resort',
    guestRating: 4.5,
    reviewCount: 1180,
    amenities: ['Wireless Internet', 'Pool', 'Valet Parking', 'Bar', 'Gym'],
    description: null,
  },
  {
    externalId: 'mock-2001',
    name: 'Sample Hill Station Villa',
    city: 'Lonavala',
    state: 'Maharashtra State',
    country: 'IN',
    countryCode: null,
    address: 'Plot 9, Sample Hill Estate',
    area: null,
    latitude: 18.7546,
    longitude: 73.4062,
    starRating: '4-star',
    propertyType: 'Villa',
    guestRating: 4.8,
    reviewCount: 312,
    amenities: ['Internet Access', 'Private Pool', 'Kitchen'],
    description: 'Mock description for development. Replace with verified content before publishing.',
    // Placeholder photographs (picsum.photos), so the image workflow can be exercised end-to-end.
    images: [
      { url: 'https://picsum.photos/seed/gk-2001-a/1200/800', category: 'Exterior', altText: 'Villa exterior' },
      { url: 'https://picsum.photos/seed/gk-2001-b/1200/800', category: 'Swimming pool', altText: 'Pool area' },
      { url: 'https://picsum.photos/seed/gk-2001-c/1200/800', category: 'Bathroom', altText: 'Bathroom' },
    ],
  },
];

export class MockHotelProvider extends HotelDataProvider {
  constructor() {
    super({ code: 'mock', displayName: 'Mock data (development)' });
  }

  async search(query, { limit = 10 } = {}) {
    const queryTokens = tokenize(query);
    return CATALOG.map((record) => {
      const haystack = tokenize(`${record.name} ${record.city} ${record.area ?? ''}`);
      const hits = [...queryTokens].filter((token) => haystack.has(token)).length;
      return { record, hits };
    })
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, limit)
      .map(({ record }) => ({
        provider: this.code,
        externalId: record.externalId,
        name: record.name,
        addressLine: record.address,
        city: record.city,
        state: record.state,
        country: record.country,
        countryCode: record.countryCode,
        latitude: record.latitude,
        longitude: record.longitude,
        thumbnailUrl: null,
        rating: record.guestRating,
        reviewCount: record.reviewCount,
        website: null,
        sourceLabel: this.displayName,
      }));
  }

  async getDetails(externalId) {
    const record = CATALOG.find((item) => item.externalId === externalId);
    if (!record) {
      throw new ProviderError(this.code, 'The selected hotel is no longer available from this source');
    }
    return {
      name: record.name,
      description: record.description,
      address: record.address,
      city: record.city,
      state: record.state,
      country: record.country,
      countryCode: record.countryCode,
      postalCode: null,
      latitude: record.latitude,
      longitude: record.longitude,
      phone: null,
      email: null,
      website: null,
      starRating: record.starRating,
      propertyType: record.propertyType,
      guestRating: record.guestRating,
      reviewCount: record.reviewCount,
      amenities: record.amenities,
      images: record.images ?? [],
      raw: record,
    };
  }
}
