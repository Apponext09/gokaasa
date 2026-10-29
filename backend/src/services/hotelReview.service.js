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
const toReviewer = (row) => ({ id: row.id, firstName: row.first_name, lastName: row.last_name, email: row.email });

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

function toReview(row, { issues = [], events = [] } = {}) {
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
    assignedReviewerId: row.assigned_reviewer_id,
    assignedReviewer: person(row.reviewer_first_name, row.reviewer_last_name),
    decidedBy: person(row.decision_first_name, row.decision_last_name),
    decisionSummary: row.decision_summary,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    approvedAt: row.approved_at,
    publishedAt: row.published_at,
    issues: issues.map((issue) => ({
      id: issue.id,
      section: issue.section,
      fieldName: issue.field_name,
      severity: issue.severity,
      comment: issue.comment,
      status: issue.status,
      createdBy: person(issue.creator_first_name, issue.creator_last_name),
      fixedBy: person(issue.fixer_first_name, issue.fixer_last_name),
      verifiedBy: person(issue.verifier_first_name, issue.verifier_last_name),
      fixedAt: issue.fixed_at,
      verifiedAt: issue.verified_at,
      createdAt: issue.created_at,
    })),
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
  const issues = await hotelReviewRepository.issues(row.id, client);
  const events = await hotelReviewRepository.events(row.id, client);
  return toReview(row, { issues, events });
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

async function claimOrAssert(client, review, actor) {
  if (!canDecide(actor)) throw AppError.forbidden('Only an administrator or Hotel Review Executive can review hotels');
  if (review.assigned_reviewer_id && review.assigned_reviewer_id !== actor.id && !isAdmin(actor)) {
    throw AppError.forbidden('This review is assigned to another reviewer');
  }
  if (!review.assigned_reviewer_id && isReviewer(actor)) {
    await hotelReviewRepository.update(client, review.id, { assigned_reviewer_id: actor.id });
    await hotelReviewRepository.addEvent(client, review.id, 'ASSIGNED', actor.id, 'Review claimed');
  }
}

async function assertNoRequiredIssues(client, reviewId) {
  const issues = await hotelReviewRepository.issues(reviewId, client);
  const unresolved = issues.filter((issue) => issue.severity === 'REQUIRED' && issue.status !== 'VERIFIED');
  if (unresolved.length) {
    throw AppError.conflict('Verify every required issue before approval', unresolved.map((issue) => ({
      field: `issue.${issue.id}`,
      message: issue.comment,
    })));
  }
}

async function approveInTransaction(client, hotel, review, actor, summary, { publish }) {
  await claimOrAssert(client, review, actor);
  if (review.status !== 'PENDING') throw AppError.conflict('Only a pending review can be approved');
  await assertNoRequiredIssues(client, review.id);
  const blockers = await readyBlockers(client, hotel);
  if (blockers.length) {
    throw AppError.unprocessable('This hotel is not ready yet', blockers.map((field) => ({ field, message: `${field} is required before publishing` })));
  }
  const now = new Date();
  await hotelReviewRepository.update(client, review.id, {
    status: publish ? 'PUBLISHED' : 'APPROVED',
    reviewed_by: actor.id,
    reviewed_at: now,
    approved_at: now,
    published_at: publish ? now : null,
    decision_summary: summary,
  });
  await hotelReviewRepository.addEvent(client, review.id, 'APPROVED', actor.id, summary);
  if (publish) await hotelReviewRepository.addEvent(client, review.id, 'PUBLISHED', actor.id, 'Approved and published');
  await hotelRepository.setStatus(client, hotel.id, publish ? 'PUBLISHED' : 'READY_TO_PUBLISH', {
    publishedAt: publish ? now : null,
    archivedAt: null,
    userId: actor.id,
  });
  await auditService.record(client, {
    actor,
    action: publish ? 'hotel.review_approved_and_published' : 'hotel.review_approved',
    entity: 'hotel',
    entityId: hotel.id,
    oldValue: { status: hotel.status },
    newValue: { status: publish ? 'PUBLISHED' : 'READY_TO_PUBLISH', reviewId: review.id, summary },
  });
}

export const hotelReviewService = {
  async list(query, actor) {
    const assignedTo = query.assignedToMe ? actor.id : null;
    const { rows, total } = await hotelReviewRepository.list({ ...query, assignedTo });
    return toPage(rows.map((row) => toReview(row)), total, query.page, query.limit);
  },

  async getForHotel(hotelId, actor) {
    const hotel = await hotelRepository.findById(hotelId);
    if (!hotel) throw AppError.notFound('Hotel not found');
    const reviewers = isAdmin(actor) ? (await hotelReviewRepository.listReviewers()).map(toReviewer) : [];
    return { review: await latestDetail(hotelId), reviewers };
  },

  async listReviewers() {
    return (await hotelReviewRepository.listReviewers()).map(toReviewer);
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

  async assign(hotelId, reviewerId, actor) {
    if (!isAdmin(actor)) throw AppError.forbidden('Only administrators can assign reviewers');
    return withTransaction(async (client) => {
      const { review } = await lockedReview(client, hotelId);
      if (!['PENDING', 'CHANGES_REQUESTED'].includes(review.status)) throw AppError.conflict('This review is already complete');
      const reviewers = await hotelReviewRepository.listReviewers(client);
      if (!reviewers.some((item) => item.id === reviewerId)) throw AppError.unprocessable('Choose an active Hotel Review Executive');
      await hotelReviewRepository.update(client, review.id, { assigned_reviewer_id: reviewerId });
      await hotelReviewRepository.addEvent(client, review.id, 'ASSIGNED', actor.id, null, { reviewerId });
      await notify(client, reviewerId, 'hotel.review_assigned', 'Hotel review assigned', `${review.hotel_name} was assigned to you for review.`, hotelId);
      return latestDetail(hotelId, client);
    });
  },

  async addIssue(hotelId, input, actor) {
    return withTransaction(async (client) => {
      const { review } = await lockedReview(client, hotelId);
      await claimOrAssert(client, review, actor);
      if (review.status !== 'PENDING') throw AppError.conflict('Issues can only be added while the review is pending');
      await hotelReviewRepository.addIssue(client, review.id, input, actor.id);
      await notify(client, review.submitted_by, 'hotel.review_issue', 'Hotel review comment added', `${review.hotel_name}: ${input.comment}`, hotelId);
      return latestDetail(hotelId, client);
    });
  },

  async updateIssue(hotelId, issueId, action, actor) {
    return withTransaction(async (client) => {
      const { review } = await lockedReview(client, hotelId);
      const issue = await hotelReviewRepository.issueForReview(issueId, review.id, client, { lock: true });
      if (!issue) throw AppError.notFound('Review issue not found');
      if (action === 'FIX') {
        if (review.status !== 'CHANGES_REQUESTED') throw AppError.conflict('The reviewer must request changes before an issue can be marked fixed');
        if (!actor.roles.some((role) => ['ADMIN', 'HOTEL_MANAGER', 'HOTEL_OWNER', 'HOTEL_ONBOARDING_EXECUTIVE'].includes(role))) throw AppError.forbidden();
        if (!isAdmin(actor) && review.submitted_by !== actor.id) {
          throw AppError.forbidden('Only the onboarding executive who submitted this review can mark its issues fixed');
        }
        if (!['OPEN', 'REOPENED'].includes(issue.status)) throw AppError.conflict('This issue is not open');
        await hotelReviewRepository.updateIssue(client, issue.id, { status: 'FIXED_BY_ONBOARDING', fixed_by: actor.id, fixed_at: new Date(), verified_by: null, verified_at: null });
        await hotelReviewRepository.addEvent(client, review.id, 'ISSUE_FIXED', actor.id, issue.comment, { issueId });
      } else {
        if (review.status !== 'PENDING') throw AppError.conflict('Resubmit the hotel before the reviewer verifies fixes');
        await claimOrAssert(client, review, actor);
        if (action === 'VERIFY') {
          if (issue.status !== 'FIXED_BY_ONBOARDING') throw AppError.conflict('The onboarding team must mark this issue fixed first');
          await hotelReviewRepository.updateIssue(client, issue.id, { status: 'VERIFIED', verified_by: actor.id, verified_at: new Date() });
          await hotelReviewRepository.addEvent(client, review.id, 'ISSUE_VERIFIED', actor.id, issue.comment, { issueId });
        } else if (action === 'REOPEN') {
          if (!['FIXED_BY_ONBOARDING', 'VERIFIED'].includes(issue.status)) throw AppError.conflict('This issue cannot be reopened');
          await hotelReviewRepository.updateIssue(client, issue.id, { status: 'REOPENED', verified_by: null, verified_at: null });
          await hotelReviewRepository.addEvent(client, review.id, 'ISSUE_REOPENED', actor.id, issue.comment, { issueId });
        }
      }
      return latestDetail(hotelId, client);
    });
  },

  async requestChanges(hotelId, summary, actor) {
    return withTransaction(async (client) => {
      const { hotel, review } = await lockedReview(client, hotelId);
      await claimOrAssert(client, review, actor);
      if (review.status !== 'PENDING') throw AppError.conflict('Only a pending review can request changes');
      const issues = await hotelReviewRepository.issues(review.id, client);
      if (!issues.some((issue) => issue.severity === 'REQUIRED' && issue.status !== 'VERIFIED')) {
        throw AppError.conflict('Add at least one required issue before requesting changes');
      }
      const now = new Date();
      await hotelReviewRepository.update(client, review.id, { status: 'CHANGES_REQUESTED', reviewed_by: actor.id, reviewed_at: now, decision_summary: summary });
      await hotelReviewRepository.addEvent(client, review.id, 'CHANGES_REQUESTED', actor.id, summary);
      await hotelRepository.setStatus(client, hotel.id, 'CHANGES_REQUESTED', { archivedAt: null, userId: actor.id });
      await auditService.record(client, { actor, action: 'hotel.changes_requested', entity: 'hotel', entityId: hotel.id, oldValue: { status: hotel.status }, newValue: { status: 'CHANGES_REQUESTED', reviewId: review.id, summary } });
      await notify(client, review.submitted_by, 'hotel.changes_requested', 'Hotel changes requested', `${hotel.name} needs updates before approval${summary ? `: ${summary}` : '.'}`, hotel.id);
      return latestDetail(hotelId, client);
    });
  },

  async approve(hotelId, summary, actor, { publish = false } = {}) {
    return withTransaction(async (client) => {
      const { hotel, review } = await lockedReview(client, hotelId);
      await approveInTransaction(client, hotel, review, actor, summary, { publish });
      await notify(client, review.submitted_by, 'hotel.review_approved', publish ? 'Hotel approved and published' : 'Hotel review approved', `${hotel.name} passed internal review.`, hotel.id);
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

