import { HotelDataProvider, ProviderError } from './hotelDataProvider.js';

/**
 * Google Places API (New). Requires GOOGLE_MAPS_API_KEY. The key is only sent to Google, in a header,
 * and is never included in errors or logs.
 *
 * Google's terms restrict how long place content and photos may be cached and displayed. Review
 * those terms before enabling this provider in production.
 */
const BASE_URL = 'https://places.googleapis.com/v1';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_PHOTOS = 8;

const SEARCH_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.websiteUri',
  'places.addressComponents',
].join(',');

const DETAIL_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'rating',
  'userRatingCount',
  'websiteUri',
  'internationalPhoneNumber',
  'addressComponents',
  'types',
  'editorialSummary',
  'photos',
].join(',');

function component(components = [], type) {
  return components.find((item) => item.types?.includes(type));
}

function fromAddressComponents(components) {
  return {
    city: component(components, 'locality')?.longText ?? component(components, 'postal_town')?.longText ?? null,
    state: component(components, 'administrative_area_level_1')?.longText ?? null,
    country: component(components, 'country')?.longText ?? null,
    countryCode: component(components, 'country')?.shortText ?? null,
    postalCode: component(components, 'postal_code')?.longText ?? null,
  };
}

export class GooglePlacesProvider extends HotelDataProvider {
  constructor({ apiKey }) {
    super({ code: 'google_places', displayName: 'Google Places' });
    this.apiKey = apiKey;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  async call(method, path, { body, fieldMask } = {}) {
    let response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          ...(fieldMask ? { 'X-Goog-FieldMask': fieldMask } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ProviderError(this.code, 'Google Places could not be reached. Please try again.', { retryable: true });
    }

    if (response.status === 429 || response.status >= 500) {
      throw new ProviderError(this.code, 'Google Places is busy right now. Please try again shortly.', {
        retryable: true,
        status: response.status,
      });
    }
    if (!response.ok) {
      throw new ProviderError(this.code, 'Google Places rejected the request. Check the provider configuration.', {
        status: response.status,
      });
    }
    return response.json();
  }

  async search(query, { limit = 10 } = {}) {
    const data = await this.call('POST', '/places:searchText', {
      body: { textQuery: query, includedType: 'lodging', maxResultCount: Math.min(limit, 20) },
      fieldMask: SEARCH_FIELDS,
    });

    return (data.places ?? []).map((place) => {
      const address = fromAddressComponents(place.addressComponents);
      return {
        provider: this.code,
        externalId: place.id,
        name: place.displayName?.text ?? null,
        addressLine: place.formattedAddress ?? null,
        city: address.city,
        state: address.state,
        country: address.country,
        countryCode: address.countryCode,
        latitude: place.location?.latitude ?? null,
        longitude: place.location?.longitude ?? null,
        thumbnailUrl: null,
        rating: place.rating ?? null,
        reviewCount: place.userRatingCount ?? null,
        website: place.websiteUri ?? null,
        sourceLabel: this.displayName,
      };
    });
  }

  async getDetails(externalId) {
    const place = await this.call('GET', `/places/${encodeURIComponent(externalId)}`, { fieldMask: DETAIL_FIELDS });
    const address = fromAddressComponents(place.addressComponents);

    const photoNames = (place.photos ?? []).slice(0, MAX_PHOTOS).map((photo) => photo.name);
    const images = [];
    for (const [index, name] of photoNames.entries()) {
      try {
        const media = await this.call('GET', `/${name}/media?maxWidthPx=1200&skipHttpRedirect=true`);
        if (media.photoUri) images.push({ url: media.photoUri, category: index === 0 ? 'COVER' : 'OTHER', altText: place.displayName?.text });
      } catch (error) {
        // A single photo failing should not fail the whole import.
        if (!(error instanceof ProviderError)) throw error;
      }
    }

    return {
      name: place.displayName?.text,
      description: place.editorialSummary?.text ?? null,
      address: place.formattedAddress,
      city: address.city,
      state: address.state,
      country: address.country,
      countryCode: address.countryCode,
      postalCode: address.postalCode,
      latitude: place.location?.latitude,
      longitude: place.location?.longitude,
      phone: place.internationalPhoneNumber ?? null,
      email: null,
      website: place.websiteUri ?? null,
      starRating: null,
      propertyType: (place.types ?? []).includes('resort_hotel') ? 'Resort' : 'Hotel',
      guestRating: place.rating ?? null,
      reviewCount: place.userRatingCount ?? 0,
      amenities: [],
      images,
      raw: { id: place.id, types: place.types ?? [] },
    };
  }
}
