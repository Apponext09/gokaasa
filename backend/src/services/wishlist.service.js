import { wishlistRepository } from '../repositories/wishlist.repository.js';
import { toCuratedCard } from './hotelSearch.service.js';
import { AppError } from '../utils/AppError.js';

export const wishlistService = {
  async list(userId) {
    const rows = await wishlistRepository.listForUser(userId);
    return rows.map((row) => ({
      ...toCuratedCard({ ...row, wishlisted: true, cover: row.cover }),
      savedAt: row.saved_at,
    }));
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
