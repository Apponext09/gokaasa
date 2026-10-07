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

const log = createLogger('hotel-images');

export const IMAGE_CATEGORIES = Object.freeze(['EXTERIOR', 'LOBBY', 'ROOM', 'BATHROOM', 'RESTAURANT', 'POOL', 'GYM', 'SPA', 'OTHER']);

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

    const detected = detectImageType(file.buffer);
    if (!detected) throw AppError.unsupportedMediaType('The file is not a valid JPEG, PNG or WebP image');
    if (detected.mime !== file.mimetype) {
      throw AppError.unsupportedMediaType('The file contents do not match its declared type');
    }

    const contentHash = createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = `hotels/${hotelId}/${randomUUID()}.${detected.ext}`;
    const storage = getStorage();

    await storage.put(storageKey, file.buffer);
    try {
      const row = await withTransaction(async (client) => {
        await requireEditableHotel(client, hotelId);

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
          origin: 'UPLOADED',
          mime_type: detected.mime,
          byte_size: file.buffer.length,
          content_hash: contentHash,
          alt_text: altText,
          sort_order: sortOrder,
          is_cover: false,
          created_by: actor.id,
        });
        await auditService.record(client, {
          actor,
          action: 'hotel.image_uploaded',
          entity: 'hotel',
          entityId: hotelId,
          newValue: { imageId: id, category, byteSize: file.buffer.length, mimeType: detected.mime },
        });
        return hotelImageRepository.findActive(hotelId, id, client);
      });
      return toImage(row);
    } catch (error) {
      // The database rejected the record, so the bytes must not stay behind as orphans.
      await storage.remove(storageKey).catch((cleanupError) => log.error('orphan cleanup failed', { storageKey, message: cleanupError.message }));
      throw error;
    }
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

      const id = await hotelImageRepository.insert(client, {
        hotel_id: hotelId,
        category: normalizeImageCategory(candidate.category),
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
      if (category !== undefined && category !== image.category) changes.category = category;
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
