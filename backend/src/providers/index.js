import { config } from '../config/index.js';
import { GooglePlacesProvider } from './googlePlacesProvider.js';
import { MockHotelProvider } from './mockHotelProvider.js';
import { OpenStreetMapProvider } from './openStreetMapProvider.js';

/**
 * Registry of every provider the application knows how to build. To add a provider, implement
 * HotelDataProvider and add a factory here; nothing else in the app needs to change.
 */
const FACTORIES = {
  openstreetmap: () => new OpenStreetMapProvider({ userAgent: config.hotelImport.osmUserAgent }),
  google_places: () => new GooglePlacesProvider({ apiKey: config.hotelImport.googleMapsApiKey }),
  mock: () => new MockHotelProvider(),
};

let cached;

/** Providers that are both listed in HOTEL_PROVIDERS and fully configured. */
export function getActiveProviders() {
  cached ??= config.hotelImport.providers
    .map((code) => FACTORIES[code]?.())
    .filter((provider) => provider?.isConfigured());
  return cached;
}

export function getActiveProvider(code) {
  return getActiveProviders().find((provider) => provider.code === code) ?? null;
}

/** Every known provider with its configuration state, for the admin health screen. No secrets. */
export function describeProviders() {
  const active = new Set(getActiveProviders().map((provider) => provider.code));
  return Object.keys(FACTORIES).map((code) => {
    const provider = FACTORIES[code]();
    return {
      code,
      displayName: provider.displayName,
      requested: config.hotelImport.providers.includes(code),
      configured: provider.isConfigured(),
      active: active.has(code),
    };
  });
}
