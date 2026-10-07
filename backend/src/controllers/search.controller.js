import { hotelSearchService } from '../services/hotelSearch.service.js';
import { wishlistService } from '../services/wishlist.service.js';

/** Customer search, destinations and the wishlist. All public except the wishlist. */
export const searchController = {
  async search(req, res) {
    const result = await hotelSearchService.search(req.validated.query, { userId: req.user?.id ?? null });
    return res.json(result);
  },

  async suggestDestinations(req, res) {
    return res.json(await hotelSearchService.suggest(req.validated.query.q));
  },

  async popularDestinations(req, res) {
    return res.json(await hotelSearchService.popular(req.validated.query.limit));
  },

  async publicStats(_req, res) {
    return res.json(await hotelSearchService.stats());
  },

  async nearby(req, res) {
    return res.json(await hotelSearchService.nearby(req.validated.query, { userId: req.user?.id ?? null }));
  },

  async handpicked(req, res) {
    return res.json(await hotelSearchService.handpicked(req.validated.query, { userId: req.user?.id ?? null }));
  },

  async listWishlist(req, res) {
    return res.json({ items: await wishlistService.list(req.user.id) });
  },

  async addWishlist(req, res) {
    return res.status(201).json(await wishlistService.add(req.user.id, req.validated.body.hotelId));
  },

  async removeWishlist(req, res) {
    await wishlistService.remove(req.user.id, req.validated.params.hotelId);
    return res.status(204).end();
  },
};
