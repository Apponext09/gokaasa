import { wishlistRepository } from '../repositories/wishlist.repository.js';
import { toHotelCard } from './hotelSearch.service.js';
import { AppError } from '../utils/AppError.js';

export const wishlistService = {
  async list(userId) {
    const rows = await wishlistRepository.listForUser(userId);
    return rows.map((row) => {
      const card = toHotelCard({ ...row, wishlisted: true, cover: row.cover, nights: 0 });
      delete card.bestOffer;
      return { ...card, savedAt: row.saved_at };
    });
  },

  async add(userId, hotelId) {
    const saved = await wishlistRepository.add(userId, hotelId);
    if (!saved) throw AppError.notFound('This hotel is not available to save');
    return { hotelId, saved: true };
  },

  async remove(userId, hotelId) {
    await wishlistRepository.remove(userId, hotelId);
  },
};
