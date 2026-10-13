import { api } from './client.js';

/** Mirrors the website's wishlist calls exactly (discoveryApi.wishlist/addWishlist/removeWishlist). */
export const wishlistApi = {
  list: () => api.get('/wishlist').then((r) => r.data.items),
  add: (hotelId) => api.post('/wishlist', { hotelId }).then((r) => r.data),
  remove: (hotelId) => api.delete(`/wishlist/${hotelId}`),
};
