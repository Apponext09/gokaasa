import { HotelDataProvider, ProviderError } from './hotelDataProvider.js';

/**
 * OpenStreetMap data via the Nominatim API. Usage policy requires an identifying User-Agent and at
 * most one request per second, both enforced here. Heavy or bulk use needs a self-hosted instance.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
const BASE_URL = 'https://nominatim.openstreetmap.org';
const HOTEL_TYPES = new Set(['hotel', 'resort', 'motel', 'guest_house', 'hostel', 'apartment', 'chalet', 'villa']);
const MIN_INTERVAL_MS = 1100;
const REQUEST_TIMEOUT_MS = 8000;

// OSM extratags that map cleanly onto amenity labels the normalizer understands.
const AMENITY_TAGS = [
  ['internet_access', (value) => (value === 'yes' || value === 'wlan' || value === 'wifi' ? 'Free WiFi' : null)],
  ['swimming_pool', (value) => (value === 'yes' ? 'Swimming Pool' : null)],
  ['fitness_centre', (value) => (value === 'yes' ? 'Gym' : null)],
  ['spa', (value) => (value === 'yes' ? 'Spa' : null)],
  ['restaurant', (value) => (value === 'yes' ? 'Restaurant' : null)],
  ['parking', (value) => (value && value !== 'no' ? 'Parking' : null)],
  ['breakfast', (value) => (value === 'yes' ? 'Breakfast' : null)],
  ['air_conditioning', (value) => (value === 'yes' ? 'Air Conditioning' : null)],
];

export class OpenStreetMapProvider extends HotelDataProvider {
  constructor({ userAgent }) {
    super({ code: 'openstreetmap', displayName: 'OpenStreetMap' });
    this.userAgent = userAgent;
    this.lastRequestAt = 0;
    this.queue = Promise.resolve();
  }

  async request(path, params) {
    // Serialise requests and keep them at least MIN_INTERVAL_MS apart.
    const run = this.queue.then(async () => {
      const wait = this.lastRequestAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastRequestAt = Date.now();

      const url = new URL(path, BASE_URL);
      for (const [key, value] of Object.entries({ format: 'jsonv2', addressdetails: 1, extratags: 1, ...params })) {
        url.searchParams.set(key, String(value));
      }

      let response;
      try {
        response = await fetch(url, {
          headers: { 'User-Agent': this.userAgent, Accept: 'application/json', 'Accept-Language': 'en' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        throw new ProviderError(this.code, 'OpenStreetMap could not be reached. Please try again.', { retryable: true });
      }

      if (response.status === 429 || response.status >= 500) {
        throw new ProviderError(this.code, 'OpenStreetMap is busy right now. Please try again shortly.', {
          retryable: true,
          status: response.status,
        });
      }
      if (!response.ok) {
        throw new ProviderError(this.code, 'OpenStreetMap rejected the request.', { status: response.status });
      }
      return response.json();
    });
    this.queue = run.catch(() => {});
    return run;
  }

  async search(query, { limit = 10 } = {}) {
    // Over-fetch because the generic search returns every kind of place; we keep only lodging below.
    const results = await this.request('/search', {
      q: query,
      limit: Math.min(limit * 3, 40),
      namedetails: 1,
    });

    return results
      .filter((item) => item.category === 'tourism' && HOTEL_TYPES.has(item.type))
      .slice(0, limit)
      .map((item) => this.toCandidate(item));
  }

  async getDetails(externalId) {
    const match = /^([NWR])(\d+)$/.exec(externalId ?? '');
    if (!match) throw new ProviderError(this.code, 'The selected hotel reference is invalid');

    const [item] = await this.request('/lookup', { osm_ids: externalId });
    if (!item) throw new ProviderError(this.code, 'The selected hotel is no longer available from this source');

    const address = item.address ?? {};
    const tags = item.extratags ?? {};
    const amenities = AMENITY_TAGS
      .map(([key, map]) => map(tags[key]))
      .filter(Boolean);
    const images = tags.image && /^https:\/\//.test(tags.image)
      ? [{ url: tags.image, category: 'COVER', altText: item.name }]
      : [];

    return {
      name: item.name ?? item.display_name?.split(',')[0],
      description: tags.description ?? null,
      address: [address.house_number, address.road].filter(Boolean).join(' ') || item.display_name,
      city: address.city ?? address.town ?? address.village ?? address.county,
      state: address.state,
      country: address.country,
      countryCode: address.country_code?.toUpperCase(),
      postalCode: address.postcode,
      latitude: item.lat,
      longitude: item.lon,
      phone: tags.phone ?? tags['contact:phone'],
      email: tags.email ?? tags['contact:email'],
      website: tags.website ?? tags['contact:website'],
      starRating: tags.stars,
      propertyType: item.type,
      guestRating: null,
      reviewCount: 0,
      amenities,
      images,
      raw: { osmType: item.osm_type, osmId: item.osm_id, type: item.type },
    };
  }

  toCandidate(item) {
    const address = item.address ?? {};
    const city = address.city ?? address.town ?? address.village ?? address.county ?? null;
    return {
      provider: this.code,
      externalId: `${item.osm_type[0].toUpperCase()}${item.osm_id}`,
      name: item.namedetails?.name ?? item.name ?? item.display_name.split(',')[0],
      addressLine: item.display_name,
      city,
      state: address.state ?? null,
      country: address.country ?? null,
      countryCode: address.country_code?.toUpperCase() ?? null,
      latitude: Number(item.lat),
      longitude: Number(item.lon),
      thumbnailUrl: null,
      rating: null,
      reviewCount: null,
      website: item.extratags?.website ?? null,
      sourceLabel: this.displayName,
    };
  }
}
