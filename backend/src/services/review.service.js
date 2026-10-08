import { pool, withTransaction } from '../db/pool.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { reviewRepository } from '../repositories/review.repository.js';
import { hotelRepository } from '../repositories/hotel.repository.js';
import { localToday } from '../domain/businessDate.js';
import { REVIEW_STATUS, canTransitionReview } from '../domain/reviewStatus.js';
import { config } from '../config/index.js';
import { auditService } from './audit.service.js';
import { notificationService } from '../notifications/notificationService.js';
import { AppError } from '../utils/AppError.js';
import { toPage } from './presenters.js';
import { toCsv } from '../utils/csv.js';

const EXPORT_CAP = 5000;

/** A stay counts as "completed" exactly the way My Trips' Completed tab already does: confirmed, check-out passed. */
function isCompletedStay(booking, today) {
  return booking.status === 'CONFIRMED' && booking.check_out < today;
}

function toPublicReview(row) {
  const lastInitial = row.last_name ? `${row.last_name.trim().charAt(0).toUpperCase()}.` : '';
  return {
    id: row.id,
    rating: row.rating,
    title: row.title,
    body: row.body,
    reviewerName: [row.first_name, lastInitial].filter(Boolean).join(' '),
    verifiedStay: true,
    createdAt: row.created_at,
  };
}

function toOwnReview(row) {
  return {
    id: row.id,
    hotelId: row.hotel_id,
    hotelName: row.hotel_name,
    hotelSlug: row.hotel_slug,
    hotelCity: row.hotel_city,
    bookingId: row.booking_id,
    rating: row.rating,
    title: row.title,
    body: row.body,
    status: row.status,
    moderationReason: row.moderation_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toModerationRow(row) {
  return {
    id: row.id,
    hotelId: row.hotel_id,
    hotelName: row.hotel_name,
    bookingRef: row.booking_ref,
    reviewer: { name: [row.first_name, row.last_name].filter(Boolean).join(' '), email: row.email },
    rating: row.rating,
    title: row.title,
    body: row.body,
    status: row.status,
    moderationReason: row.moderation_reason,
    moderatedAt: row.moderated_at,
    createdAt: row.created_at,
  };
}

async function hotelScopeFor(actor) {
  if (actor.roles.includes('ADMIN')) return null;
  return hotelRepository.managedHotelIds(actor.id);
}

/** Resolves a booking the caller owns and classifies why it can or cannot be reviewed. Never trusts a client-supplied hotelId. */
async function eligibilityFor(userId, bookingId) {
  const booking = await bookingRepository.findBooking(bookingId);
  if (!booking || booking.user_id !== userId) {
    // A booking that belongs to someone else looks exactly like one that does not exist.
    return { eligible: false, reason: 'NOT_FOUND', booking: null };
  }
  const today = localToday(config.booking.businessTimezone);
  if (!isCompletedStay(booking, today)) {
    return { eligible: false, reason: 'NOT_COMPLETED', booking };
  }
  // Two constraints, both enforced in the database: one review per booking, and -- independently -- one
  // review per guest per hotel, however many stays they have had there (reviews.hotel_id/user_id UNIQUE).
  const existing = (await reviewRepository.findByBookingId(bookingId)) ?? (await reviewRepository.findByHotelAndUser(booking.hotel_id, userId));
  if (existing) {
    return { eligible: false, reason: 'ALREADY_REVIEWED', booking, review: existing };
  }
  return { eligible: true, reason: null, booking };
}

export const reviewService = {
  async eligibility(userId, bookingId) {
    const result = await eligibilityFor(userId, bookingId);
    if (result.reason === 'NOT_FOUND') throw AppError.notFound('Booking not found');
    return {
      eligible: result.eligible,
      reason: result.reason,
      review: result.review ? toOwnReview({ ...result.review, hotel_name: null, hotel_slug: null, hotel_city: null }) : null,
    };
  },

  /** Rating and the stay are required; hotelId is never accepted from the client -- it comes from the booking. */
  async create(userId, { bookingId, rating, title, body }) {
    const result = await eligibilityFor(userId, bookingId);
    if (result.reason === 'NOT_FOUND') throw AppError.notFound('Booking not found');
    if (result.reason === 'NOT_COMPLETED') throw AppError.conflict('You can review a hotel after your stay is complete.');
    if (result.reason === 'ALREADY_REVIEWED') throw AppError.conflict('You have already reviewed this booking.');

    const review = await withTransaction(async (client) => {
      const row = await reviewRepository.insert(client, { hotelId: result.booking.hotel_id, bookingId, userId, rating, title, body });
      await auditService.record(client, {
        actor: { id: userId },
        action: 'review.created',
        entity: 'review',
        entityId: row.id,
        newValue: { hotelId: row.hotel_id, bookingId, rating },
      });
      return toOwnReview({ ...row, hotel_name: null, hotel_slug: null, hotel_city: null });
    });
    notificationService.sendReviewSubmitted(result.booking.hotel_id, result.booking.hotel_name, review.id).catch(() => {});
    return review;
  },

  /** Only the review's own author, and only the content -- never hotel_id, booking_id or status directly. */
  async update(userId, reviewId, { rating, title, body }) {
    return withTransaction(async (client) => {
      const review = await reviewRepository.lockById(reviewId, client);
      if (!review || review.user_id !== userId) throw AppError.notFound('Review not found');

      await reviewRepository.update(client, reviewId, {
        rating, title: title ?? null, body: body ?? null,
        status: REVIEW_STATUS.PENDING, moderated_by: null, moderated_at: null, moderation_reason: null,
      });
      await auditService.record(client, { actor: { id: userId }, action: 'review.updated', entity: 'review', entityId: reviewId, newValue: { rating } });
      const fresh = await reviewRepository.findById(reviewId, client);
      return toOwnReview({ ...fresh, hotel_name: null, hotel_slug: null, hotel_city: null });
    });
  },

  async remove(userId, reviewId) {
    return withTransaction(async (client) => {
      const review = await reviewRepository.lockById(reviewId, client);
      if (!review || review.user_id !== userId) throw AppError.notFound('Review not found');
      await reviewRepository.remove(client, reviewId);
      await auditService.record(client, { actor: { id: userId }, action: 'review.deleted', entity: 'review', entityId: reviewId, oldValue: { hotelId: review.hotel_id } });
    });
  },

  async listMine(userId) {
    const rows = await reviewRepository.listForUser(userId);
    return rows.map(toOwnReview);
  },

  async listForHotelPublic(hotelId, query) {
    const { rows, total } = await reviewRepository.listApprovedForHotel(hotelId, query);
    return toPage(rows.map(toPublicReview), total, query.page, query.limit);
  },

  /** Average, count and the 1-5 distribution. Approved reviews only, computed live from the database. */
  async ratingForHotel(hotelId) {
    const row = await reviewRepository.aggregateForHotel(hotelId);
    return {
      average: row.count > 0 ? Math.round(Number(row.average) * 10) / 10 : null,
      count: row.count,
      distribution: { 5: row.r5, 4: row.r4, 3: row.r3, 2: row.r2, 1: row.r1 },
    };
  },

  /** Read access for ADMIN (everything) and HOTEL_MANAGER (their assigned hotels, read-only -- see moderate()). */
  async listForModeration(query, actor) {
    const hotelIds = await hotelScopeFor(actor);
    const { rows, total } = await reviewRepository.listForModeration(query, hotelIds);
    return toPage(rows.map(toModerationRow), total, query.page, query.limit);
  },

  /** Same filters and scoping as `listForModeration`, just every matching row (up to a safety cap) instead of one page. */
  async exportReviews(query, actor) {
    const hotelIds = await hotelScopeFor(actor);
    const { rows } = await reviewRepository.listForModeration({ ...query, page: 1, limit: EXPORT_CAP }, hotelIds);
    const items = rows.map(toModerationRow);
    return toCsv(items, [
      { key: 'hotelName', header: 'Hotel' }, { key: 'bookingRef', header: 'Booking Ref' },
      { key: 'reviewer.name', header: 'Guest' }, { key: 'reviewer.email', header: 'Email' },
      { key: 'rating', header: 'Rating' }, { key: 'title', header: 'Title' }, { key: 'body', header: 'Review' },
      { key: 'status', header: 'Status' }, { key: 'moderationReason', header: 'Moderation Reason' },
      { key: 'moderatedAt', header: 'Moderated At' }, { key: 'createdAt', header: 'Created' },
    ]);
  },

  /** ADMIN only, enforced by the route (authorize('ADMIN')) -- a HOTEL_MANAGER never reaches here. */
  async moderate(reviewId, action, reason, actor) {
    const nextStatus = { APPROVE: REVIEW_STATUS.APPROVED, REJECT: REVIEW_STATUS.REJECTED, HIDE: REVIEW_STATUS.HIDDEN, RESTORE: REVIEW_STATUS.APPROVED }[action];
    const auditVerb = { APPROVE: 'approved', REJECT: 'rejected', HIDE: 'hidden', RESTORE: 'restored' }[action];
    if (!nextStatus) throw AppError.unprocessable('Unknown moderation action');

    return withTransaction(async (client) => {
      const review = await reviewRepository.lockById(reviewId, client);
      if (!review) throw AppError.notFound('Review not found');
      if (!canTransitionReview(review.status, nextStatus)) {
        throw AppError.conflict(`Cannot ${action.toLowerCase()} a review that is ${review.status.toLowerCase()}`);
      }
      await reviewRepository.update(client, reviewId, {
        status: nextStatus, moderated_by: actor.id, moderated_at: new Date(), moderation_reason: reason ?? null,
      });
      await auditService.record(client, {
        actor, action: `review.${auditVerb}`, entity: 'review', entityId: reviewId,
        oldValue: { status: review.status }, newValue: { status: nextStatus, reason: reason ?? null },
      });
      const fresh = await reviewRepository.findById(reviewId, client);
      return fresh;
    }).then(async (row) => {
      if (action === 'APPROVE' || action === 'REJECT') {
        const hotel = await hotelRepository.findById(row.hotel_id).catch(() => null);
        notificationService.sendReviewDecision(row, hotel?.name ?? '', action).catch(() => {});
      }
      return toModerationRow({ ...row, first_name: null, last_name: null, email: null, hotel_name: null, booking_ref: null });
    });
  },
};

export { isCompletedStay };
