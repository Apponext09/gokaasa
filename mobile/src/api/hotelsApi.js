import { api } from './client.js';

/**
 * Customer discovery/search/details -- mirrors the website's discoveryApi + hotelApi exactly.
 *
 * search() and suggestDestinations() accept an optional AbortSignal so a screen can cancel a stale
 * request (the user kept typing, or changed the destination before the previous search returned) --
 * matches the website's own discoveryApi convention for the same reason.
 */
export const hotelsApi = {
  search: (params, { signal } = {}) => api.get('/hotels/search', { params, signal }).then((r) => r.data),
  suggestDestinations: (q, { signal } = {}) => api.get('/destinations/search', { params: { q }, signal }).then((r) => r.data.items),
  popularDestinations: (params) => api.get('/destinations/popular', { params }).then((r) => r.data.items),
  stats: () => api.get('/destinations/stats').then((r) => r.data),
  // Verified against production: each item's image is a raw `coverImageId` (a DB id), NOT a resolved
  // `image.url` the way search()/handpickedHotels() below return -- there is no public endpoint to turn
  // that id into a URL. Don't render these items with HotelCard as-is; it expects `hotel.image.url`.
  featuredHotels: (limit = 8) => api.get('/hotels', { params: { limit } }).then((r) => r.data.items),
  handpickedHotels: (params) => api.get('/hotels/handpicked', { params }).then((r) => r.data),
  amenities: () => api.get('/amenities').then((r) => r.data.amenities),
  hotel: (ref) => api.get(`/hotels/${encodeURIComponent(ref)}`).then((r) => r.data.hotel),
  availability: (ref, params) => api.get(`/hotels/${encodeURIComponent(ref)}/availability`, { params }).then((r) => r.data),
  reviews: (ref, params) => api.get(`/hotels/${encodeURIComponent(ref)}/reviews`, { params }).then((r) => r.data),
};
