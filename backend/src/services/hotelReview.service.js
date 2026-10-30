import { config } from '../config/index.js';
import { pool, withTransaction } from '../db/pool.js';
import { getPublishBlockers } from '../domain/hotelPublishRules.js';
import { hotelRepository } from '../repositories/hotel.repository.js';
import { hotelReviewRepository } from '../repositories/hotelReview.repository.js';
import { auditService } from './audit.service.js';
import { notificationService } from './notification.service.js';
import { AppError } from '../utils/AppError.js';
import { toPage } from './presenters.js';

const isAdmin = (actor) => actor.roles.includes('ADMIN');
const isReviewer = (actor) => actor.roles.includes('HOTEL_REVIEW_EXECUTIVE');
const canDecide = (actor) => isAdmin(actor) || isReviewer(actor);
const person = (first, last) => [first, last].filter(Boolean).join(' ') || null;

async function notify(client, userId, type, title, message, hotelId) {
  if (!userId) return;
  await notificationService.create(client, { userId, type, title, message, entityType: 'hotel', entityId: hotelId });
}

async function notifyReviewTeam(client, hotel, actorId) {
  const { rows } = await client.query(
    `SELECT DISTINCT u.id FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id
     WHERE r.code IN ('ADMIN', 'HOTEL_REVIEW_EXECUTIVE')
       AND u.is_active AND u.deleted_at IS NULL AND u.id <> $1`,
    [actorId],
  );
  // A transaction client runs one query at a time; keep these inserts sequential.
  for (const { id } of rows) {
    await notify(client, id, 'hotel.review_submitted', 'Hotel ready for review', `${hotel.name} was submitted for internal review.`, hotel.id);
  }
}

function toReview(row, { events = [] } = {}) {
  return {
    id: row.id,
    hotelId: row.hotel_id,
    hotelName: row.hotel_name,
    hotelCity: row.hotel_city,
    hotelStatus: row.hotel_status,
    roundNumber: row.round_number,
    submissionCount: row.submission_count,
    status: row.status,
    submittedById: row.submitted_by,
    submittedBy: person(row.submitter_first_name, row.submitter_last_name),
    decidedBy: person(row.decision_first_name, row.decision_last_name),
    decisionSummary: row.decision_summary,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    approvedAt: row.approved_at,
    publishedAt: row.published_at,
    events: events.map((event) => ({
      id: event.id,
      type: event.event_type,
      actor: person(event.first_name, event.last_name),
      message: event.message,
      metadata: event.metadata,
      createdAt: event.created_at,
    })),
  };
}

async function latestDetail(hotelId, client = pool) {
  const row = await hotelReviewRepository.latestForHotel(hotelId, client);
  if (!row) return null;
  const events = await hotelReviewRepository.events(row.id, client);
  return toReview(row, { events });
}

async function readyBlockers(client, hotel) {
  const images = await hotelRepository.listImages(hotel.id, client);
  const amenities = await hotelRepository.listAmenities(hotel.id, client);
  const countable = config.features.allowIllustrativeHotelImages
    ? images
    : images.filter((image) => image.image_type !== 'ILLUSTRATIVE');
  return getPublishBlockers(
    {
      name: hotel.name,
      addressLine: hotel.address_line,
      city: hotel.city,
      countryCode: hotel.country_code,
      locationUrl: hotel.location_url,
      latitude: hotel.latitude,
      longitude: hotel.longitude,
      description: hotel.description,
      starRating: hotel.star_rating,
    },
    { imageCount: countable.length, amenityCount: amenities.length, hasCover: countable.some((image) => image.is_cover) },
  );
}

async function lockedReview(client, hotelId) {
  const hotel = await hotelRepository.findById(hotelId, { client });
  if (!hotel) throw AppError.notFound('Hotel not found');
  const review = await hotelReviewRepository.latestForHotel(hotelId, client, { lock: true });
  if (!review) throw AppError.conflict('Submit this hotel for review first');
  return { hotel, review };
}

function assertCanDecide(actor) {
  if (!canDecide(actor)) throw AppError.forbidden('Only an administrator or Hotel Review Executive can review hotels');
}

async function approveInTransaction(client, hotel, review, actor, summary) {
  assertCanDecide(actor);
  if (review.status !== 'PENDING') throw AppError.conflict('Only a pending review can be approved');
  const blockers = await readyBlockers(client, hotel);
  if (blockers.length) {
    throw AppError.unprocessable('This hotel is not ready yet', blockers.map((field) => ({ field, message: `${field} is required before publishing` })));
  }
  const now = new Date();
  await hotelReviewRepository.update(client, review.id, {
    status: 'APPROVED',
    reviewed_by: actor.id,
    reviewed_at: now,
    approved_at: now,
    published_at: null,
    decision_summary: summary,
  });
  await hotelReviewRepository.addEvent(client, review.id, 'APPROVED', actor.id, summary);
  await hotelRepository.setStatus(client, hotel.id, 'READY_TO_PUBLISH', {
    publishedAt: null,
    archivedAt: null,
    userId: actor.id,
  });
  await auditService.record(client, {
    actor,
    action: 'hotel.review_approved',
    entity: 'hotel',
    entityId: hotel.id,
    oldValue: { status: hotel.status },
    newValue: { status: 'READY_TO_PUBLISH', reviewId: review.id, summary },
  });
}

export const hotelReviewService = {
  async list(query) {
    const { rows, total } = await hotelReviewRepository.list(query);
    return toPage(rows.map((row) => toReview(row)), total, query.page, query.limit);
  },

  async getForHotel(hotelId) {
    const hotel = await hotelRepository.findById(hotelId);
    if (!hotel) throw AppError.notFound('Hotel not found');
    return { review: await latestDetail(hotelId) };
  },

  async submit(client, hotelId, actor) {
    try {
      const hotel = await hotelRepository.findById(hotelId, { client });
      if (!hotel) throw AppError.notFound('Hotel not found');
      const review = await hotelReviewRepository.createSubmission(client, hotelId, actor.id);
      await notifyReviewTeam(client, hotel, actor.id);
      return review;
    } catch (error) {
      if (error.message === 'REVIEW_ALREADY_PENDING') throw AppError.conflict('This hotel is already waiting for review');
      throw error;
    }
  },


  async requestChanges(hotelId, summary, actor) {
    return withTransaction(async (client) => {
      const { hotel, review } = await lockedReview(client, hotelId);
      assertCanDecide(actor);
      if (review.status !== 'PENDING') throw AppError.conflict('Only a pending review can request changes');
      const now = new Date();
      await hotelReviewRepository.update(client, review.id, { status: 'CHANGES_REQUESTED', reviewed_by: actor.id, reviewed_at: now, decision_summary: summary });
      await hotelReviewRepository.addEvent(client, review.id, 'CHANGES_REQUESTED', actor.id, summary);
      await hotelRepository.setStatus(client, hotel.id, 'CHANGES_REQUESTED', { archivedAt: null, userId: actor.id });
      await auditService.record(client, { actor, action: 'hotel.changes_requested', entity: 'hotel', entityId: hotel.id, oldValue: { status: hotel.status }, newValue: { status: 'CHANGES_REQUESTED', reviewId: review.id, summary } });
      await notify(client, review.submitted_by, 'hotel.changes_requested', 'Hotel changes requested', `${hotel.name} needs updates before approval${summary ? `: ${summary}` : '.'}`, hotel.id);
      return latestDetail(hotelId, client);
    });
  },

  async approve(hotelId, summary, actor) {
    return withTransaction(async (client) => {
      const { hotel, review } = await lockedReview(client, hotelId);
      await approveInTransaction(client, hotel, review, actor, summary);
      await notify(client, review.submitted_by, 'hotel.review_approved', 'Hotel review approved', `${hotel.name} passed internal review and is ready to publish.`, hotel.id);
      return latestDetail(hotelId, client);
    });
  },

  async markPublished(client, hotelId, actor) {
    const review = await hotelReviewRepository.latestForHotel(hotelId, client, { lock: true });
    if (!review || !['APPROVED', 'PUBLISHED'].includes(review.status)) {
      throw AppError.conflict('Reviewer approval is required before publishing this hotel');
    }
    if (review.status === 'APPROVED') {
      await hotelReviewRepository.update(client, review.id, { status: 'PUBLISHED', published_at: new Date() });
      await hotelReviewRepository.addEvent(client, review.id, 'PUBLISHED', actor.id, 'Published after approval');
    }
  },

  /** Explicit ADMIN override retained for operational recovery and legacy admin tooling. */
  async adminApprovePending(client, hotelId, actor, summary = null) {
    if (!isAdmin(actor)) throw AppError.forbidden('Only an administrator can override internal review');
    const review = await hotelReviewRepository.latestForHotel(hotelId, client, { lock: true });
    if (!review) throw AppError.conflict('Submit this hotel for review first');
    if (review.status === 'APPROVED' || review.status === 'PUBLISHED') return;
    if (review.status !== 'PENDING') throw AppError.conflict('Only a pending review can be overridden');
    const now = new Date();
    await hotelReviewRepository.update(client, review.id, {
      status: 'APPROVED', reviewed_by: actor.id, reviewed_at: now, approved_at: now,
      decision_summary: summary || 'Approved by administrator override',
    });
    await hotelReviewRepository.addEvent(client, review.id, 'APPROVED', actor.id, summary || 'Administrator override');
  },
};

