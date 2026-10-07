import { reviewService } from '../services/review.service.js';
import { hotelRepository } from '../repositories/hotel.repository.js';
import { AppError } from '../utils/AppError.js';

function actorOf(req) {
  return { id: req.user.id, roles: req.user.roles, ip: req.ip };
}

export const reviewController = {
  async eligibility(req, res) {
    return res.json(await reviewService.eligibility(req.user.id, req.validated.params.bookingId));
  },

  async create(req, res) {
    return res.status(201).json({ review: await reviewService.create(req.user.id, req.validated.body) });
  },

  async update(req, res) {
    return res.json({ review: await reviewService.update(req.user.id, req.validated.params.id, req.validated.body) });
  },

  async remove(req, res) {
    await reviewService.remove(req.user.id, req.validated.params.id);
    return res.status(204).end();
  },

  async mine(req, res) {
    return res.json({ reviews: await reviewService.listMine(req.user.id) });
  },

  /** Accepts the same numeric-id-or-slug reference every other public hotel route does. */
  async forHotel(req, res) {
    const hotel = await hotelRepository.findById(req.validated.params.idOrSlug, { publicOnly: true });
    if (!hotel) throw AppError.notFound('Hotel not found');
    const [reviews, rating] = await Promise.all([
      reviewService.listForHotelPublic(hotel.id, req.validated.query),
      reviewService.ratingForHotel(hotel.id),
    ]);
    return res.json({ ...reviews, rating });
  },

  // Admin / hotel manager
  async listForModeration(req, res) {
    return res.json(await reviewService.listForModeration(req.validated.query, actorOf(req)));
  },

  async moderate(req, res) {
    return res.json({ review: await reviewService.moderate(req.validated.params.id, req.validated.body.action, req.validated.body.reason, actorOf(req)) });
  },
};
