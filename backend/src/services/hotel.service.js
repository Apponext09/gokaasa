import { withTransaction, pool } from '../db/pool.js';
import { hotelRepository } from '../repositories/hotel.repository.js';
import { auditService } from './audit.service.js';
import { getPublishBlockers } from '../domain/hotelPublishRules.js';
import { EDITABLE_STATUSES, HOTEL_ACTION, resolveTransition } from '../domain/hotelStatus.js';
import { COLUMN_FOR, PUBLISH_REQUIRED_FIELDS, SOURCE, TRACKED_FIELDS, describeField, isEmptyValue } from '../domain/fieldProvenance.js';
import { fieldProvenanceRepository } from '../repositories/fieldProvenance.repository.js';
import { cancellationPolicyRepository } from '../repositories/cancellationPolicy.repository.js';
import { wishlistRepository } from '../repositories/wishlist.repository.js';
import { hotelSearchService } from './hotelSearch.service.js';
import { describePolicy } from '../domain/cancellationPolicy.js';
import { hotelImportRepository } from '../repositories/hotelImport.repository.js';
import { reviewService } from './review.service.js';
import { AppError } from '../utils/AppError.js';
import { slugify } from '../utils/slug.js';
import { toHotelDetail, toHotelSummary, toPage } from './presenters.js';
import { assignManagerIfNeeded } from '../middleware/hotelAccess.js';
import { notificationService } from '../notifications/notificationService.js';


// Only ADMIN may release or withdraw a hotel. HOTEL_MANAGER can prepare and submit drafts.
const ADMIN_ONLY_ACTIONS = new Set([HOTEL_ACTION.PUBLISH, HOTEL_ACTION.UNPUBLISH, HOTEL_ACTION.ARCHIVE]);

const ACTION_LABEL = {
  SAVE_DRAFT: 'save draft',
  SUBMIT_FOR_REVIEW: 'submit for review',
  MARK_READY: 'mark ready to publish',
  PUBLISH: 'publish',
  UNPUBLISH: 'unpublish',
  ARCHIVE: 'archive',
};

function toColumns(input) {
  const columns = {};
  for (const [key, column] of Object.entries(COLUMN_FOR)) {
    if (input[key] !== undefined) columns[column] = input[key];
  }
  return columns;
}

/** Publish requirements for a snake_case hotel row plus its loaded images and amenities. */
function publishBlockersFor(row, images, amenities) {
  return getPublishBlockers(
    {
      name: row.name,
      addressLine: row.address_line,
      city: row.city,
      countryCode: row.country_code,
      latitude: row.latitude,
      longitude: row.longitude,
      description: row.description,
      starRating: row.star_rating,
    },
    { imageCount: images.length, amenityCount: amenities.length, hasCover: images.some((image) => image.is_cover) },
  );
}

async function loadHotelDetail(client, id, { publicOnly = false, includeInternal = false } = {}) {
  const row = await hotelRepository.findById(id, { client, publicOnly });
  if (!row) throw AppError.notFound('Hotel not found');
  // Sequential on purpose: a transaction client must not run two queries at once.
  const amenities = await hotelRepository.listAmenities(row.id, client);
  const images = await hotelRepository.listImages(row.id, client);
  if (!includeInternal) return toHotelDetail(row, { amenities, images });

  const provenance = await fieldProvenanceRepository.listForHotel(row.id, client);
  const fieldStates = Object.fromEntries(
    TRACKED_FIELDS.map((field) => [
      field,
      describeField(row[COLUMN_FOR[field]], provenance[field], { required: PUBLISH_REQUIRED_FIELDS.includes(field) }),
    ]),
  );
  const importJobId = await hotelImportRepository.latestJobIdForHotel(row.id, client);
  return toHotelDetail(row, {
    amenities,
    images,
    blockers: publishBlockersFor(row, images, amenities),
    fieldStates,
    importJobId,
    includeInternal: true,
  });
}

async function uniqueSlug(client, base) {
  let candidate = base || 'hotel';
  let suffix = 2;
  while (await hotelRepository.slugTaken(candidate, client)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export const hotelService = {
  /** Admin/hotel-manager list with every status visible. A manager sees only its assigned hotels. */
  async listAdmin(query, actor) {
    const managerUserId = actor?.roles.includes('ADMIN') ? null : actor?.id ?? null;
    const { rows, total } = await hotelRepository.list(query, { managerUserId });
    return toPage(rows.map((row) => toHotelSummary(row, { includeInternal: true })), total, query.page, query.limit);
  },

  async getAdmin(id) {
    return loadHotelDetail(pool, id, { includeInternal: true });
  },

  async createManual(input, actor) {
    return withTransaction(async (client) => {
      const slug = await uniqueSlug(client, slugify(input.name, input.city));
      const id = await hotelRepository.insert(client, {
        ...toColumns(input),
        slug,
        status: 'DRAFT',
        created_by: actor.id,
        updated_by: actor.id,
      });
      await assignManagerIfNeeded(client, { creatorId: actor.id, hotelId: id });
      await auditService.record(client, {
        actor,
        action: 'hotel.created',
        entity: 'hotel',
        entityId: id,
        newValue: { name: input.name, city: input.city, source: 'manual' },
      });
      return loadHotelDetail(client, id, { includeInternal: true });
    });
  },

  async updateDetails(id, input, actor) {
    return withTransaction(async (client) => {
      const current = await hotelRepository.findById(id, { client });
      if (!current) throw AppError.notFound('Hotel not found');
      if (!EDITABLE_STATUSES.includes(current.status)) {
        throw AppError.conflict('Archived hotels are read-only. Restore is not available yet.');
      }

      const columns = toColumns(input);
      const oldValue = {};
      const newValue = {};
      for (const [column, value] of Object.entries(columns)) {
        const before = current[column];
        if (String(before ?? '') !== String(value ?? '')) {
          oldValue[column] = before ?? null;
          newValue[column] = value ?? null;
        }
      }

      if (Object.keys(newValue).length > 0) {
        await hotelRepository.update(client, current.id, { ...newValue, updated_by: actor.id });

        // Provider-backed fields that an admin edits become MANUALLY_MODIFIED: sync will not overwrite them.
        if (current.external_provider) {
          const fieldForColumn = Object.fromEntries(Object.entries(COLUMN_FOR).map(([field, column]) => [column, field]));
          for (const column of Object.keys(newValue)) {
            const field = fieldForColumn[column];
            if (TRACKED_FIELDS.includes(field)) {
              await fieldProvenanceRepository.upsertSource(client, current.id, field, { source: SOURCE.MANUALLY_MODIFIED });
            }
          }
        }

        await auditService.record(client, {
          actor,
          action: 'hotel.updated',
          entity: 'hotel',
          entityId: current.id,
          oldValue,
          newValue,
        });
      }
      return loadHotelDetail(client, current.id, { includeInternal: true });
    });
  },

  /**
   * Marks fields as checked by an admin. A verified field keeps its value and is protected from sync
   * until it is edited again (which clears verification, see updateDetails).
   */
  async verifyFields(id, fields, actor) {
    return withTransaction(async (client) => {
      const hotel = await hotelRepository.findById(id, { client });
      if (!hotel) throw AppError.notFound('Hotel not found');
      if (!EDITABLE_STATUSES.includes(hotel.status)) throw AppError.conflict('Archived hotels cannot be verified');

      const uniqueFields = [...new Set(fields)];
      const empty = uniqueFields.filter((field) => isEmptyValue(hotel[COLUMN_FOR[field]]));
      if (empty.length > 0) {
        throw AppError.unprocessable(
          'Empty fields cannot be verified. Add a value first.',
          empty.map((field) => ({ field: `fields.${field}`, message: 'This field is empty' })),
        );
      }

      for (const field of uniqueFields) {
        await fieldProvenanceRepository.markVerified(client, hotel.id, field, actor.id);
      }
      await auditService.record(client, {
        actor,
        action: 'hotel.fields_verified',
        entity: 'hotel',
        entityId: hotel.id,
        newValue: { fields: uniqueFields },
      });
      return loadHotelDetail(client, hotel.id, { includeInternal: true });
    });
  },

  async setAmenities(id, codes, actor) {
    return withTransaction(async (client) => {
      const hotel = await hotelRepository.findById(id, { client });
      if (!hotel) throw AppError.notFound('Hotel not found');

      const uniqueCodes = [...new Set(codes)];
      const found = await hotelRepository.findAmenityIdsByCodes(client, uniqueCodes);
      const unknown = uniqueCodes.filter((code) => !found.some((row) => row.code === code));
      if (unknown.length > 0) {
        throw AppError.unprocessable('Some amenities are not recognised', unknown.map((code) => ({ field: 'codes', message: `Unknown amenity ${code}` })));
      }

      const before = (await hotelRepository.listAmenities(hotel.id, client)).map((amenity) => amenity.code);
      await hotelRepository.replaceAmenities(client, hotel.id, found.map((row) => row.id));
      await hotelRepository.update(client, hotel.id, { updated_by: actor.id });
      await auditService.record(client, {
        actor,
        action: 'hotel.amenities_changed',
        entity: 'hotel',
        entityId: hotel.id,
        oldValue: { amenities: before.sort() },
        newValue: { amenities: [...uniqueCodes].sort() },
      });
      return loadHotelDetail(client, hotel.id, { includeInternal: true });
    });
  },

  async transition(id, action, actor) {
    if (ADMIN_ONLY_ACTIONS.has(action) && !actor.roles.includes('ADMIN')) {
      throw AppError.forbidden('Only administrators can change publication status');
    }

    const detail = await withTransaction(async (client) => {
      const hotel = await hotelRepository.findById(id, { client });
      if (!hotel) throw AppError.notFound('Hotel not found');

      const nextStatus = resolveTransition(hotel.status, action);
      if (!nextStatus) {
        const currentLabel = hotel.status.toLowerCase().replaceAll('_', ' ');
        throw AppError.conflict(`Cannot ${ACTION_LABEL[action]} a hotel that is ${currentLabel}`);
      }

      if (nextStatus === 'READY_TO_PUBLISH' || nextStatus === 'PUBLISHED') {
        const images = await hotelRepository.listImages(hotel.id, client);
        const amenities = await hotelRepository.listAmenities(hotel.id, client);
        const blockers = publishBlockersFor(hotel, images, amenities);
        if (blockers.length > 0) {
          throw AppError.unprocessable(
            'This hotel is not ready yet',
            blockers.map((field) => ({ field, message: `${field} is required before publishing` })),
          );
        }
      }

      const now = new Date();
      await hotelRepository.setStatus(client, hotel.id, nextStatus, {
        publishedAt: nextStatus === 'PUBLISHED' ? now : null,
        archivedAt: nextStatus === 'ARCHIVED' ? now : null,
        userId: actor.id,
      });
      await auditService.record(client, {
        actor,
        action: `hotel.${action.toLowerCase()}`,
        entity: 'hotel',
        entityId: hotel.id,
        oldValue: { status: hotel.status },
        newValue: { status: nextStatus },
      });
      return loadHotelDetail(client, hotel.id, { includeInternal: true });
    });
    if (action === 'SUBMIT_FOR_REVIEW') {
      notificationService.sendHotelSubmittedForReview(detail).catch(() => {});
    }
    return detail;
  },

  /** Public, published-only listing for customers. */
  async listPublic(query) {
    const { rows, total } = await hotelRepository.list(query, { publicOnly: true });
    return toPage(rows.map((row) => toHotelSummary(row)), total, query.page, query.limit);
  },

  /**
   * Public hotel page data. Only published hotels resolve. Internal fields never leave this method:
   * the detail DTO is built without includeInternal, and policies are reduced to their guest-facing summary.
   */
  async getPublic(idOrSlug, { userId = null } = {}) {
    const detail = await loadHotelDetail(pool, idOrSlug, { publicOnly: true });
    const [policies, similarHotels, isWishlisted, rating] = await Promise.all([
      cancellationPolicyRepository.listForHotel(detail.id),
      hotelSearchService.similar(detail),
      wishlistRepository.has(userId, detail.id),
      reviewService.ratingForHotel(detail.id),
    ]);
    return {
      ...detail,
      // Gokaasa's own guest-review aggregate (reviews.*, APPROVED only). Separate from starRating/
      // guestRating/reviewCount above, which are provider-sourced and still drive search sort/filter —
      // this is intentionally additive, not a replacement, so nothing there changes behaviour.
      rating,
      cancellationPolicies: policies
        .filter((policy) => policy.status === 'ACTIVE')
        .map((policy) => ({ code: policy.code, name: policy.name, summary: describePolicy(policy) })),
      similarHotels,
      isWishlisted,
    };
  },
};
