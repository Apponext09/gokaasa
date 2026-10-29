import { createHash, randomUUID } from 'node:crypto';
import { config } from '../config/index.js';
import { withTransaction } from '../db/pool.js';
import { hotelRepository } from '../repositories/hotel.repository.js';
import { hotelImageRepository } from '../repositories/hotelImage.repository.js';
import { auditService } from './audit.service.js';
import { getStorage } from '../storage/index.js';
import { detectImageType } from '../utils/imageSignature.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import { toImage } from './presenters.js';
import { hotelImportRepository } from '../repositories/hotelImport.repository.js';
import { normalizeImageCategory } from '../normalizers/hotelNormalizer.js';
import { catalogService } from './catalog.service.js';

const log = createLogger('hotel-images');

async function requireEditableHotel(client, hotelId) {
  const hotel = await hotelRepository.findById(hotelId, { client });
  if (!hotel) throw AppError.notFound('Hotel not found');
  if (hotel.status === 'ARCHIVED') throw AppError.conflict('Archived hotels are read-only');
  return hotel;
}

async function requireImage(client, hotelId, imageId) {
  const image = await hotelImageRepository.findActive(hotelId, imageId, client);
  if (!image) throw AppError.notFound('Image not found');
  return image;
}

/**
 * The common path for turning real image bytes into a stored, recorded hotel image: validates the
 * actual file contents (never the caller's claimed type), rejects a duplicate by content hash, stores
 * the bytes, and inserts the row. Shared by `upload` (bytes from a multipart file) and `addFromUrl`
 * (bytes downloaded from an external source) so the two never validate or persist differently.
 */
async function storeAndInsertImage(hotelId, { buffer, mimetype, category, altText, origin, sourceUrl = null, sourceProvider = null, imageType = 'REAL_PROPERTY' }, actor) {
  if (!buffer?.length) throw AppError.badRequest('No image data was received');

  const detected = detectImageType(buffer);
  if (!detected) throw AppError.unsupportedMediaType('The file is not a valid JPEG, PNG, WebP or AVIF image');
  if (mimetype && detected.mime !== mimetype) {
    throw AppError.unsupportedMediaType('The file contents do not match its declared type');
  }

  const contentHash = createHash('sha256').update(buffer).digest('hex');
  const storageKey = `hotels/${hotelId}/${randomUUID()}.${detected.ext}`;
  const storage = getStorage();

  await storage.put(storageKey, buffer);
  try {
    const row = await withTransaction(async (client) => {
      await requireEditableHotel(client, hotelId);
      await catalogService.requireActive('image-categories', category, client);

      const { rows: countRows } = await client.query(
        `SELECT COUNT(*)::int AS count FROM hotel_images WHERE hotel_id = $1 AND deleted_at IS NULL`,
        [hotelId],
      );
      if (countRows[0].count >= config.media.maxImagesPerHotel) {
        throw AppError.conflict(`A hotel can have at most ${config.media.maxImagesPerHotel} images`);
      }

      const { rowCount: duplicate } = await client.query(
        `SELECT 1 FROM hotel_images WHERE hotel_id = $1 AND content_hash = $2 AND deleted_at IS NULL`,
        [hotelId, contentHash],
      );
      if (duplicate > 0) throw AppError.conflict('This image has already been added to the hotel');

      const sortOrder = await hotelImageRepository.nextSortOrder(client, hotelId);
      const id = await hotelImageRepository.insert(client, {
        hotel_id: hotelId,
        category,
        storage_key: storageKey,
        source_url: sourceUrl,
        source_provider: sourceProvider,
        origin,
        mime_type: detected.mime,
        byte_size: buffer.length,
        content_hash: contentHash,
        alt_text: altText,
        image_type: imageType,
        sort_order: sortOrder,
        is_cover: false,
        created_by: actor.id,
      });
      await auditService.record(client, {
        actor,
        action: origin === 'UPLOADED' ? 'hotel.image_uploaded' : 'hotel.image_imported',
        entity: 'hotel',
        entityId: hotelId,
        newValue: { imageId: id, category, byteSize: buffer.length, mimeType: detected.mime, sourceUrl, imageType },
      });
      return hotelImageRepository.findActive(hotelId, id, client);
    });
    return toImage(row);
  } catch (error) {
    // The database rejected the record, so the bytes must not stay behind as orphans.
    await storage.remove(storageKey).catch((cleanupError) => log.error('orphan cleanup failed', { storageKey, message: cleanupError.message }));
    throw error;
  }
}

export const hotelImageService = {
  async list(hotelId) {
    const rows = await hotelImageRepository.listActive(hotelId);
    return rows.map(toImage);
  },

  /**
   * Validates the real file contents (not the client's claimed type), stores it under a server-generated
   * key and records it. The first upload does NOT become the cover; that is always an explicit choice.
   */
  async upload(hotelId, file, { category = 'OTHER', altText = null }, actor) {
    if (!file?.buffer?.length) throw AppError.badRequest('Choose an image to upload');
    return storeAndInsertImage(hotelId, { buffer: file.buffer, mimetype: file.mimetype, category, altText, origin: 'UPLOADED' }, actor);
  },

  /**
   * Downloads a real image from a public, freely-licensed source (e.g. Wikimedia Commons) and runs it
   * through the exact same validation and storage path as a direct upload. `sourceProvider`/`sourceUrl`
   * are recorded so the image's origin and license status stay traceable -- this never invents a photo,
   * it only persists one that was actually fetched and verified as a real image.
   */
  async addFromUrl(hotelId, { sourceUrl, category = 'OTHER', altText = null, sourceProvider = 'manual', imageType = 'REAL_PROPERTY' }, actor) {
    const hotel = await hotelRepository.findById(hotelId);
    if (!hotel) throw AppError.notFound('Hotel not found');
    if (hotel.status === 'ARCHIVED') throw AppError.conflict('Archived hotels are read-only');

    let response;
    try {
      response = await fetch(sourceUrl, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': config.hotelImport.osmUserAgent } });
    } catch {
      throw AppError.badRequest('Could not download an image from that URL. Check the address and try again.');
    }
    if (!response.ok) throw AppError.badRequest('That URL did not return an image.');
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!contentType.startsWith('image/')) {
      throw AppError.unsupportedMediaType('That URL is not an image (it looks like a web page or another file type).');
    }
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > config.media.maxUploadBytes) {
      throw AppError.unsupportedMediaType(`The image is larger than the ${Math.round(config.media.maxUploadBytes / 1024 / 1024)}MB limit`);
    }
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > config.media.maxUploadBytes) {
      throw AppError.unsupportedMediaType(`The image is larger than the ${Math.round(config.media.maxUploadBytes / 1024 / 1024)}MB limit`);
    }

    return storeAndInsertImage(
      hotelId,
      { buffer: Buffer.from(arrayBuffer), mimetype: contentType, category, altText, origin: 'IMPORTED', sourceUrl, sourceProvider, imageType },
      actor,
    );
  },

  /**
   * Adds back an image that the provider supplied. The URL must appear in the stored provider record for
   * this hotel, so this endpoint can never be used to inject arbitrary remote content.
   */
  async addFromProvider(hotelId, sourceUrl, actor) {
    return withTransaction(async (client) => {
      const hotel = await requireEditableHotel(client, hotelId);
      if (!hotel.external_provider) throw AppError.unprocessable('This hotel was not imported from a provider');

      const jobId = await hotelImportRepository.latestJobIdForHotel(hotelId, client);
      const job = jobId ? await hotelImportRepository.findJobById(jobId, client) : null;
      const candidate = (job?.raw_response?.images ?? []).find((image) => image.url === sourceUrl);
      if (!candidate) throw AppError.unprocessable('That image is not part of the provider record for this hotel');

      if (await hotelImageRepository.findBySourceUrl(hotelId, sourceUrl, client)) {
        throw AppError.conflict('This image is already in the gallery');
      }
      const { rows: countRows } = await client.query(
        `SELECT COUNT(*)::int AS count FROM hotel_images WHERE hotel_id = $1 AND deleted_at IS NULL`,
        [hotelId],
      );
      if (countRows[0].count >= config.media.maxImagesPerHotel) {
        throw AppError.conflict(`A hotel can have at most ${config.media.maxImagesPerHotel} images`);
      }

      const category = normalizeImageCategory(candidate.category);
      await catalogService.requireActive('image-categories', category, client);
      const id = await hotelImageRepository.insert(client, {
        hotel_id: hotelId,
        category,
        source_url: sourceUrl,
        source_provider: hotel.external_provider,
        origin: 'IMPORTED',
        alt_text: candidate.altText ?? null,
        sort_order: await hotelImageRepository.nextSortOrder(client, hotelId),
        is_cover: false,
      });
      await auditService.record(client, {
        actor,
        action: 'hotel.image_added_from_provider',
        entity: 'hotel',
        entityId: hotelId,
        newValue: { imageId: id, sourceUrl },
      });
      return toImage(await hotelImageRepository.findActive(hotelId, id, client));
    });
  },

  async updateDetails(hotelId, imageId, { category, altText }, actor) {
    return withTransaction(async (client) => {
      await requireEditableHotel(client, hotelId);
      const image = await requireImage(client, hotelId, imageId);
      const changes = {};
      if (category !== undefined && category !== image.category) {
        await catalogService.requireActive('image-categories', category, client);
        changes.category = category;
      }
      if (altText !== undefined && altText !== image.alt_text) changes.alt_text = altText;
      if (Object.keys(changes).length > 0) {
        await hotelImageRepository.updateFields(client, imageId, changes);
        await auditService.record(client, {
          actor,
          action: 'hotel.image_updated',
          entity: 'hotel',
          entityId: hotelId,
          oldValue: { imageId, category: image.category, altText: image.alt_text },
          newValue: { imageId, ...changes },
        });
      }
      return toImage(await requireImage(client, hotelId, imageId));
    });
  },

  async replace(hotelId, imageId, file, actor) {
    if (!file?.buffer?.length) throw AppError.badRequest('Choose an image to upload');
    const detected = detectImageType(file.buffer);
    if (!detected) throw AppError.unsupportedMediaType('The file is not a valid JPEG, PNG, WebP or AVIF image');
    if (file.mimetype && detected.mime !== file.mimetype) {
      throw AppError.unsupportedMediaType('The file contents do not match its declared type');
    }

    const contentHash = createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = `hotels/${hotelId}/${randomUUID()}.${detected.ext}`;
    const storage = getStorage();

    await storage.put(storageKey, file.buffer);
    let previousStorageKey = null;

    try {
      const row = await withTransaction(async (client) => {
        await requireEditableHotel(client, hotelId);
        const existing = await requireImage(client, hotelId, imageId);
        previousStorageKey = existing.storage_key;

        await hotelImageRepository.updateFields(client, imageId, {
          storage_key: storageKey,
          mime_type: detected.mime,
          byte_size: file.buffer.length,
          content_hash: contentHash,
          origin: 'UPLOADED',
          source_url: null,
          source_provider: null,
        });

        await auditService.record(client, {
          actor,
          action: 'hotel.image_replaced',
          entity: 'hotel',
          entityId: hotelId,
          oldValue: { imageId, byteSize: existing.byte_size },
          newValue: { imageId, byteSize: file.buffer.length, mimeType: detected.mime },
        });

        return hotelImageRepository.findActive(hotelId, imageId, client);
      });

      if (previousStorageKey && previousStorageKey !== storageKey) {
        await storage.remove(previousStorageKey).catch((cleanupError) =>
          log.error('old image cleanup failed', { storageKey: previousStorageKey, message: cleanupError.message }),
        );
      }

      return toImage(row);
    } catch (error) {
      await storage.remove(storageKey).catch((cleanupError) =>
        log.error('orphan cleanup failed', { storageKey, message: cleanupError.message }),
      );
      throw error;
    }
  },

  /** Cover is an explicit selection. Exactly one active image can be the cover at a time. */
  async setCover(hotelId, imageId, actor) {
    return withTransaction(async (client) => {
      await requireEditableHotel(client, hotelId);
      const image = await requireImage(client, hotelId, imageId);
      await hotelImageRepository.clearCover(client, hotelId);
      await hotelImageRepository.updateFields(client, image.id, { is_cover: true });
      await auditService.record(client, {
        actor,
        action: 'hotel.cover_changed',
        entity: 'hotel',
        entityId: hotelId,
        oldValue: { coverImageId: image.is_cover ? image.id : null },
        newValue: { coverImageId: image.id },
      });
      return toImage(await requireImage(client, hotelId, imageId));
    });
  },

  /** The body must list every active image exactly once. Partial lists are rejected to avoid silent gaps. */
  async reorder(hotelId, orderedIds, actor) {
    return withTransaction(async (client) => {
      await requireEditableHotel(client, hotelId);
      const active = await hotelImageRepository.listActive(hotelId, client);
      const activeIds = active.map((image) => image.id).sort((a, b) => a - b);
      const requested = [...orderedIds].sort((a, b) => a - b);
      const unique = new Set(orderedIds).size === orderedIds.length;
      if (!unique || activeIds.length !== requested.length || activeIds.some((id, index) => id !== requested[index])) {
        throw AppError.unprocessable('The new order must include every image exactly once');
      }
      await hotelImageRepository.setSortOrders(client, hotelId, orderedIds);
      await auditService.record(client, {
        actor,
        action: 'hotel.images_reordered',
        entity: 'hotel',
        entityId: hotelId,
        oldValue: { order: active.map((image) => image.id) },
        newValue: { order: orderedIds },
      });
      return hotelImageRepository.listActive(hotelId, client).then((rows) => rows.map(toImage));
    });
  },

  /**
   * Removes an image from the gallery. Uploaded files are deleted from storage. Imported images are
   * only hidden, so the admin can add them back from the provider panel.
   */
  async remove(hotelId, imageId, actor) {
    const image = await withTransaction(async (client) => {
      await requireEditableHotel(client, hotelId);
      const existing = await requireImage(client, hotelId, imageId);
      await hotelImageRepository.softDelete(client, imageId);
      await auditService.record(client, {
        actor,
        action: 'hotel.image_removed',
        entity: 'hotel',
        entityId: hotelId,
        oldValue: { imageId, origin: existing.origin, category: existing.category },
      });
      return existing;
    });

    if (image.origin === 'UPLOADED' && image.storage_key) {
      await getStorage()
        .remove(image.storage_key)
        .catch((error) => log.error('could not delete stored file', { storageKey: image.storage_key, message: error.message }));
    }
  },
};
