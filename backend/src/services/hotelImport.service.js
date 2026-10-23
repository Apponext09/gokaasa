import { withTransaction, pool } from '../db/pool.js';
import { hotelRepository } from '../repositories/hotel.repository.js';
import { hotelImportRepository } from '../repositories/hotelImport.repository.js';
import { auditService } from './audit.service.js';
import { getActiveProvider, getActiveProviders } from '../providers/index.js';
import { ProviderError } from '../providers/hotelDataProvider.js';
import { normalizeHotel, rawFieldValues } from '../normalizers/hotelNormalizer.js';
import { TRACKED_FIELDS, canonical, importSourceFor } from '../domain/fieldProvenance.js';
import { fieldProvenanceRepository } from '../repositories/fieldProvenance.repository.js';
import { hotelImageRepository } from '../repositories/hotelImage.repository.js';
import { getStorage } from '../storage/index.js';
import { matchConfidence } from '../normalizers/matching.js';
import { AppError } from '../utils/AppError.js';
import { slugify } from '../utils/slug.js';
import { createLogger } from '../utils/logger.js';
import { toImage, toImportJob, toHotelDetail, toPage } from './presenters.js';
import { hotelService } from './hotel.service.js';
import { assignManagerIfNeeded } from '../middleware/hotelAccess.js';

const log = createLogger('hotel-import');
const MAX_ATTEMPTS = 3;
const SEARCH_TIMEOUT_MS = 9000;
const RETRY_BASE_MS = 5000;

/** Race a provider call against a deadline so one slow source cannot stall the whole search. */
function withDeadline(promise, ms) {
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new ProviderError('timeout', 'The source took too long to respond')), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/** Messages stored on jobs and shown to admins. Unexpected errors never expose internals. */
function safeProviderMessage(error) {
  if (error instanceof ProviderError || error instanceof AppError) return error.message;
  return 'Unexpected error while importing this hotel. Please try again.';
}

let queue;

export function setImportQueue(instance) {
  queue = instance;
}

/** Test-only accessor: lets teardown drain/stop whichever queue instance is currently active. */
export function getImportQueue() {
  return queue;
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

export const hotelImportService = {
  /**
   * Searches every active provider in parallel. A failing provider is reported, not fatal.
   * Results are only candidates: nothing is stored until an admin chooses to import one.
   */
  async search(query, { limit = 10 } = {}) {
    const providers = getActiveProviders();
    if (providers.length === 0) {
      throw AppError.serviceUnavailable('No hotel data source is configured. You can still create the hotel manually.');
    }

    const outcomes = await Promise.all(
      providers.map((provider) =>
        withDeadline(provider.search(query, { limit }), SEARCH_TIMEOUT_MS)
          .then((candidates) => ({ provider, candidates }))
          .catch((error) => ({ provider, error })),
      ),
    );

    const results = [];
    const providerErrors = [];
    for (const outcome of outcomes) {
      if (outcome.error) {
        const message = safeProviderMessage(outcome.error);
        log.warn('provider search failed', { provider: outcome.provider.code, reason: outcome.error.message });
        await hotelImportRepository.recordSourceError(outcome.provider.code, message);
        providerErrors.push({ provider: outcome.provider.code, displayName: outcome.provider.displayName, message });
        continue;
      }
      await hotelImportRepository.recordSourceSuccess(outcome.provider.code);

      for (const candidate of outcome.candidates) {
        const existing = await hotelRepository.findByExternal(candidate.provider, candidate.externalId);
        results.push({
          ...candidate,
          matchConfidence: matchConfidence({
            query,
            name: candidate.name,
            city: candidate.city,
            state: candidate.state,
          }),
          alreadyImported: existing ? { hotelId: existing.id, slug: existing.slug, status: existing.status } : null,
        });
      }
    }

    results.sort((a, b) => b.matchConfidence - a.matchConfidence);
    return { query, results, providerErrors };
  },

  /** Creates an import job and hands it to the background queue. Returns immediately. */
  async requestImport({ provider: providerCode, externalId, query }, actor) {
    const provider = getActiveProvider(providerCode);
    if (!provider) throw AppError.unprocessable('That hotel data source is not available');

    const existing = await hotelRepository.findByExternal(providerCode, externalId);
    if (existing) {
      throw AppError.conflict('This hotel has already been imported', {
        hotelId: existing.id,
        slug: existing.slug,
        status: existing.status,
      });
    }

    const job = await withTransaction(async (client) => {
      const active = await hotelImportRepository.findActiveJob(client, providerCode, externalId);
      if (active) return { id: active.id, reused: true };

      const id = await hotelImportRepository.insertJob(client, {
        searchQuery: query ?? externalId,
        provider: providerCode,
        externalHotelId: externalId,
        createdBy: actor.id,
      });
      await auditService.record(client, {
        actor,
        action: 'hotel_import.requested',
        entity: 'hotel_import_job',
        entityId: id,
        newValue: { provider: providerCode, externalId },
      });
      return { id, reused: false };
    });

    if (!job.reused) queue?.enqueue(job.id);
    const row = await hotelImportRepository.findJobById(job.id);
    return toImportJob(row);
  },

  /**
   * Worker entry point. Fetches details, normalises them and stores a DRAFT hotel. The hotel is never
   * published here: publication always needs an admin.
   */
  async processJob(jobId) {
    const claimed = await withTransaction((client) => hotelImportRepository.claimJob(client, jobId));
    if (!claimed) return;

    try {
      const provider = getActiveProvider(claimed.provider);
      if (!provider) {
        throw new ProviderError(claimed.provider, 'This data source is no longer enabled', { retryable: false });
      }

      await pool.query(
        `INSERT INTO hotel_import_logs (job_id, level, message) VALUES ($1, 'INFO', 'Fetching details from source')`,
        [jobId],
      );
      const raw = await provider.getDetails(claimed.external_hotel_id);
      const normalized = normalizeHotel(raw);

      await withTransaction(async (client) => {
        const duplicate = await hotelRepository.findByExternal(claimed.provider, claimed.external_hotel_id, client);
        if (duplicate) {
          throw AppError.conflict('This hotel was imported while the job was running', { hotelId: duplicate.id });
        }

        const slug = await uniqueSlug(client, slugify(normalized.hotel.name, normalized.hotel.city));
        const hotelId = await hotelRepository.insert(client, {
          ...toHotelColumns(normalized.hotel),
          slug,
          status: 'DRAFT',
          external_provider: claimed.provider,
          external_id: claimed.external_hotel_id,
          created_by: claimed.created_by,
          updated_by: claimed.created_by,
        });

        // Provenance: every tracked field records what the provider said and whether normalisation changed it.
        const rawValues = rawFieldValues(raw);
        for (const field of TRACKED_FIELDS) {
          const value = normalized.hotel[field] ?? null;
          await fieldProvenanceRepository.upsertSource(client, hotelId, field, {
            source: importSourceFor(rawValues[field], value),
            externalValue: canonical(value) || null,
          });
        }

        const amenityRows = await hotelRepository.findAmenityIdsByCodes(client, normalized.amenityCodes);
        await hotelRepository.replaceAmenities(client, hotelId, amenityRows.map((row) => row.id));

        await hotelRepository.insertImages(
          client,
          hotelId,
          normalized.images.map((image, index) => ({
            ...image,
            sourceProvider: claimed.provider,
            isCover: false,
          })),
        );

        await assignManagerIfNeeded(client, { creatorId: claimed.created_by, hotelId });

        const needsReview = normalized.missing.length > 0;
        await hotelImportRepository.updateJob(client, jobId, {
          status: needsReview ? 'REVIEW_REQUIRED' : 'COMPLETED',
          hotel_id: hotelId,
          // The full provider record is kept so the review workspace can show exactly what the source sent.
          raw_response: JSON.stringify(raw),
          normalized_data: JSON.stringify({
            hotel: normalized.hotel,
            amenityCodes: normalized.amenityCodes,
            unmappedAmenities: normalized.unmappedAmenities,
            imageCount: normalized.images.length,
            missing: normalized.missing,
            warnings: normalized.warnings,
          }),
          error_message: null,
          finished_at: new Date(),
        });

        for (const warning of normalized.warnings) {
          await hotelImportRepository.appendLog(client, jobId, { level: 'WARN', message: warning });
        }
        await hotelImportRepository.appendLog(client, jobId, {
          level: needsReview ? 'WARN' : 'INFO',
          message: needsReview
            ? `Draft created. Needs review: ${normalized.missing.join(', ')}`
            : 'Draft created with all core fields populated',
          details: { hotelId, missing: normalized.missing },
        });
        await auditService.record(client, {
          actor: { id: claimed.created_by },
          action: 'hotel.imported',
          entity: 'hotel',
          entityId: hotelId,
          newValue: { provider: claimed.provider, externalId: claimed.external_hotel_id, jobId },
        });
      });
      await hotelImportRepository.recordSourceSuccess(claimed.provider);
    } catch (error) {
      await this.handleFailure(jobId, claimed, error);
    }
  },

  async handleFailure(jobId, claimed, error) {
    const retryable = error instanceof ProviderError && error.retryable;
    const message = safeProviderMessage(error);

    if (retryable && claimed.attempts < MAX_ATTEMPTS) {
      await hotelImportRepository.updateJob(pool, jobId, { status: 'PENDING', error_message: message });
      await pool.query(
        `INSERT INTO hotel_import_logs (job_id, level, message, details) VALUES ($1, 'WARN', $2, $3)`,
        [jobId, `Attempt ${claimed.attempts} failed; retrying`, JSON.stringify({ reason: message })],
      );
      queue?.enqueue(jobId, RETRY_BASE_MS * claimed.attempts);
      return;
    }

    if (error instanceof ProviderError || error instanceof AppError) {
      log.warn('import job failed', { jobId, provider: claimed.provider, reason: error.message });
    } else {
      log.error('import job failed unexpectedly', { jobId, message: error.message, stack: error.stack });
    }
    await hotelImportRepository.updateJob(pool, jobId, {
      status: 'FAILED',
      error_message: message,
      finished_at: new Date(),
    });
    await pool.query(
      `INSERT INTO hotel_import_logs (job_id, level, message) VALUES ($1, 'ERROR', $2)`,
      [jobId, message],
    );
    if (error instanceof ProviderError) {
      await hotelImportRepository.recordSourceError(claimed.provider, message);
    }
  },

  /** Everything the split-screen review needs: the provider record as received, and the Gokaasa draft. */
  async getReview(id) {
    const row = await hotelImportRepository.findJobWithCreator(id);
    if (!row) throw AppError.notFound('Import job not found');
    const logs = await hotelImportRepository.listLogs(id);
    const provider = getActiveProvider(row.provider);
    const hotel = row.hotel_id ? await hotelService.getAdmin(row.hotel_id).catch(() => null) : null;

    return {
      job: toImportJob(row, { includeDetails: false }),
      logs: logs.map((entry) => ({ level: entry.level, message: entry.message, details: entry.details, at: entry.created_at })),
      external: {
        provider: row.provider,
        displayName: provider?.displayName ?? row.provider,
        externalId: row.external_hotel_id,
        // As received from the provider.
        record: row.raw_response,
        // The same record after Gokaasa normalisation, for like-for-like comparison with the draft.
        normalized: row.normalized_data?.hotel ?? null,
      },
      hotel,
      canDiscard: row.status !== 'DISCARDED' && !['PENDING', 'PROCESSING'].includes(row.status) && !hotel?.publishedAt,
    };
  },

  /**
   * Discards an import before publication. The draft is soft-deleted (so the external record can be
   * imported again later) and uploaded files are removed from storage. Published hotels are never discarded.
   */
  async discard(id, actor) {
    const row = await hotelImportRepository.findJobWithCreator(id);
    if (!row) throw AppError.notFound('Import job not found');
    if (row.status === 'DISCARDED') throw AppError.conflict('This import has already been discarded');
    if (['PENDING', 'PROCESSING'].includes(row.status)) throw AppError.conflict('Wait for the import to finish before discarding it');

    const uploadKeys = [];
    await withTransaction(async (client) => {
      if (row.hotel_id) {
        const hotel = await hotelRepository.findById(row.hotel_id, { client });
        if (hotel && (hotel.published_at || hotel.status === 'PUBLISHED')) {
          throw AppError.conflict('Published hotels cannot be discarded. Unpublish or archive them instead.');
        }
        if (hotel) {
          uploadKeys.push(...(await hotelImageRepository.listUploadKeys(hotel.id, client)));
          await client.query(
            `UPDATE hotels SET deleted_at = now(), updated_at = now(), updated_by = $2 WHERE id = $1`,
            [hotel.id, actor.id],
          );
        }
      }
      await hotelImportRepository.markDiscarded(client, id);
      await auditService.record(client, {
        actor,
        action: 'hotel_import.discarded',
        entity: 'hotel_import_job',
        entityId: id,
        oldValue: { status: row.status },
        newValue: { status: 'DISCARDED', hotelId: row.hotel_id },
      });
    });

    for (const key of uploadKeys) {
      await getStorage().remove(key).catch((error) => log.error('could not remove discarded upload', { key, message: error.message }));
    }
    return toImportJob(await hotelImportRepository.findJobWithCreator(id));
  },

  /** Import history for one hotel, including failed attempts for the same external record. */
  async historyForHotel(hotel) {
    const rows = await hotelImportRepository.historyForHotel({
      hotelId: hotel.id,
      provider: hotel.externalProvider,
      externalId: hotel.externalId,
    });
    return rows.map((row) => toImportJob(row));
  },

  async getJob(id) {
    const row = await hotelImportRepository.findJobById(id);
    if (!row) throw AppError.notFound('Import job not found');
    const logs = await hotelImportRepository.listLogs(id);
    return {
      ...toImportJob(row, { includeDetails: true }),
      logs: logs.map((entry) => ({ level: entry.level, message: entry.message, details: entry.details, at: entry.created_at })),
    };
  },

  /** ADMIN sees every job; HOTEL_MANAGER sees only the ones it started. */
  async listJobs(query, actor) {
    const createdBy = actor.roles.includes('ADMIN') ? null : actor.id;
    const { rows, total } = await hotelImportRepository.listJobs({ ...query, createdBy });
    return toPage(rows.map((row) => toImportJob(row)), total, query.page, query.limit);
  },

  /** Called once on boot: re-queue anything interrupted by a crash or restart. */
  async resumeInterruptedJobs() {
    const reset = await hotelImportRepository.resetInterrupted();
    const pending = await hotelImportRepository.listPendingIds();
    for (const id of pending) queue?.enqueue(id);
    if (reset > 0 || pending.length > 0) {
      log.info('resumed import jobs', { reset, queued: pending.length });
    }
  },
};

/** Keeps only the columns that exist on `hotels` from the normalised hotel shape. */
function toHotelColumns(hotel) {
  return {
    name: hotel.name,
    short_name: hotel.shortName,
    description: hotel.description,
    property_type: hotel.propertyType,
    star_rating: hotel.starRating,
    guest_rating: hotel.guestRating,
    review_count: hotel.reviewCount,
    address_line: hotel.addressLine,
    area: hotel.area,
    city: hotel.city,
    state: hotel.state,
    country_code: hotel.countryCode,
    postal_code: hotel.postalCode,
    latitude: hotel.latitude,
    longitude: hotel.longitude,
    phone: hotel.phone,
    email: hotel.email,
    website: hotel.website,
  };
}
