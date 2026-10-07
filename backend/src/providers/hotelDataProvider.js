/**
 * Contract every hotel data source implements. The rest of the application only talks to this
 * interface, so a new provider (Google Places, a licensed hotel API, a partner feed) is added by
 * writing one class and registering it in providers/index.js.
 *
 * Providers must only use official APIs, licensed datasets or publicly permitted sources.
 * They must never scrape sites or bypass anti-bot protection.
 *
 * ExternalHotelCandidate (search result):
 *   { provider, externalId, name, addressLine, city, state, country, countryCode,
 *     latitude, longitude, thumbnailUrl, rating, reviewCount, website, sourceLabel }
 *
 * ExternalHotelRecord (details, input to normalizeHotel):
 *   { name, description, address, city, state, country, countryCode, postalCode,
 *     latitude, longitude, phone, email, website, starRating, propertyType, guestRating,
 *     reviewCount, amenities: string[], images: [{ url, category, altText }], raw }
 */
export class HotelDataProvider {
  /**
   * @param {{ code: string, displayName: string }} options
   */
  constructor({ code, displayName }) {
    if (new.target === HotelDataProvider) {
      throw new Error('HotelDataProvider is abstract');
    }
    this.code = code;
    this.displayName = displayName;
  }

  /** True when all credentials or configuration needed to call the provider are present. */
  isConfigured() {
    return true;
  }

  /**
   * @param {string} query
   * @param {{ limit: number, signal?: AbortSignal }} options
   * @returns {Promise<object[]>} ExternalHotelCandidate[]
   */
  async search(_query, _options) {
    throw new Error(`${this.code}.search is not implemented`);
  }

  /**
   * @param {string} externalId
   * @returns {Promise<object>} ExternalHotelRecord
   */
  async getDetails(_externalId) {
    throw new Error(`${this.code}.getDetails is not implemented`);
  }
}

/**
 * Error raised by providers. `message` is safe to show to admins and is stored on import jobs;
 * it must never contain API keys, URLs with keys, or raw upstream response bodies.
 */
export class ProviderError extends Error {
  constructor(provider, message, { retryable = false, status } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.retryable = retryable;
    this.upstreamStatus = status;
  }
}
