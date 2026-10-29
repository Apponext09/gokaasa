import { createHash, randomUUID } from 'node:crypto';
import { config } from '../config/index.js';
import { withTransaction } from '../db/pool.js';
import { roomTypeRepository } from '../repositories/roomType.repository.js';
import { auditService } from './audit.service.js';
import { getStorage } from '../storage/index.js';
import { detectImageType } from '../utils/imageSignature.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';

// Room images use the same storage driver, validation and key rules as hotel images, under rooms/.
const log = createLogger('room-images');

function toRoomImage(row) {
  return {
    id: row.id,
    url: getStorage().publicUrl(row.storage_key),
    altText: row.alt_text,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    sortOrder: row.sort_order,
    isCover: row.is_cover,
  };
}

async function requireEditableRoom(client, roomTypeId) {
  const room = await roomTypeRepository.lockById(roomTypeId, client);
  if (!room) throw AppError.notFound('Room type not found');
  if (room.status === 'ARCHIVED') throw AppError.conflict('Archived room types are read-only');
  return room;
}

export const roomImageService = {
  async list(roomTypeId) {
    return (await roomTypeRepository.listImages(roomTypeId)).map(toRoomImage);
  },

  async upload(roomTypeId, file, actor) {
    if (!file?.buffer?.length) throw AppError.badRequest('Choose an image to upload');
    const detected = detectImageType(file.buffer);
    if (!detected) throw AppError.unsupportedMediaType('The file is not a valid JPEG, PNG, WebP or AVIF image');
    if (detected.mime !== file.mimetype) throw AppError.unsupportedMediaType('The file contents do not match its declared type');

    const contentHash = createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = `rooms/${roomTypeId}/${randomUUID()}.${detected.ext}`;
    const storage = getStorage();
    await storage.put(storageKey, file.buffer);

    try {
      const row = await withTransaction(async (client) => {
        await requireEditableRoom(client, roomTypeId);
        const { rows: countRows } = await client.query(
          `SELECT COUNT(*)::int AS count FROM room_images WHERE room_type_id = $1 AND deleted_at IS NULL`,
          [roomTypeId],
        );
        if (countRows[0].count >= config.media.maxImagesPerRoom) {
          throw AppError.conflict(`A room type can have at most ${config.media.maxImagesPerRoom} images`);
        }
        const { rowCount: duplicate } = await client.query(
          `SELECT 1 FROM room_images WHERE room_type_id = $1 AND content_hash = $2 AND deleted_at IS NULL`,
          [roomTypeId, contentHash],
        );
        if (duplicate > 0) throw AppError.conflict('This image has already been added to this room type');

        const { rows: next } = await client.query(
          `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM room_images WHERE room_type_id = $1 AND deleted_at IS NULL`,
          [roomTypeId],
        );
        const { rows } = await client.query(
          `INSERT INTO room_images (room_type_id, storage_key, mime_type, byte_size, content_hash, sort_order, is_cover, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7) RETURNING id`,
          [roomTypeId, storageKey, detected.mime, file.buffer.length, contentHash, next[0].next, actor.id],
        );
        await auditService.record(client, {
          actor,
          action: 'room_type.image_uploaded',
          entity: 'room_type',
          entityId: roomTypeId,
          newValue: { imageId: rows[0].id, byteSize: file.buffer.length, mimeType: detected.mime },
        });
        return rows[0].id;
      });
      const created = (await roomTypeRepository.listImages(roomTypeId)).find((image) => image.id === row);
      return toRoomImage(created);
    } catch (error) {
      await storage.remove(storageKey).catch((cleanupError) => log.error('orphan cleanup failed', { storageKey, message: cleanupError.message }));
      throw error;
    }
  },

  async replace(roomTypeId, imageId, file, actor) {
    if (!file?.buffer?.length) throw AppError.badRequest('Choose an image to upload');
    const detected = detectImageType(file.buffer);
    if (!detected) throw AppError.unsupportedMediaType('The file is not a valid JPEG, PNG, WebP or AVIF image');
    if (detected.mime !== file.mimetype) throw AppError.unsupportedMediaType('The file contents do not match its declared type');

    const contentHash = createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = `rooms/${roomTypeId}/${randomUUID()}.${detected.ext}`;
    const storage = getStorage();
    await storage.put(storageKey, file.buffer);
    let previousStorageKey = null;

    try {
      await withTransaction(async (client) => {
        await requireEditableRoom(client, roomTypeId);
        const existing = await roomTypeRepository.findImage(roomTypeId, imageId, client);
        if (!existing) throw AppError.notFound('Image not found');
        previousStorageKey = existing.storage_key;

        await client.query(
          `UPDATE room_images SET storage_key = $1, mime_type = $2, byte_size = $3, content_hash = $4 WHERE id = $5 AND room_type_id = $6`,
          [storageKey, detected.mime, file.buffer.length, contentHash, imageId, roomTypeId],
        );

        await auditService.record(client, {
          actor,
          action: 'room_type.image_replaced',
          entity: 'room_type',
          entityId: roomTypeId,
          oldValue: { imageId, byteSize: existing.byte_size },
          newValue: { imageId, byteSize: file.buffer.length, mimeType: detected.mime },
        });
      });

      if (previousStorageKey && previousStorageKey !== storageKey) {
        await storage.remove(previousStorageKey).catch((cleanupError) =>
          log.error('old room image cleanup failed', { storageKey: previousStorageKey, message: cleanupError.message }),
        );
      }

      const updated = (await roomTypeRepository.listImages(roomTypeId)).find((image) => image.id === imageId);
      return toRoomImage(updated);
    } catch (error) {
      await storage.remove(storageKey).catch((cleanupError) => log.error('orphan cleanup failed', { storageKey, message: cleanupError.message }));
      throw error;
    }
  },

  async setCover(roomTypeId, imageId, actor) {
    await withTransaction(async (client) => {
      await requireEditableRoom(client, roomTypeId);
      const image = await roomTypeRepository.findImage(roomTypeId, imageId, client);
      if (!image) throw AppError.notFound('Image not found');
      await client.query(`UPDATE room_images SET is_cover = FALSE WHERE room_type_id = $1 AND is_cover`, [roomTypeId]);
      await client.query(`UPDATE room_images SET is_cover = TRUE WHERE id = $1`, [imageId]);
      await auditService.record(client, {
        actor,
        action: 'room_type.cover_changed',
        entity: 'room_type',
        entityId: roomTypeId,
        newValue: { coverImageId: imageId },
      });
    });
    return this.list(roomTypeId);
  },

  /** The list must name every active image exactly once. */
  async reorder(roomTypeId, orderedIds, actor) {
    await withTransaction(async (client) => {
      await requireEditableRoom(client, roomTypeId);
      const active = await roomTypeRepository.listImages(roomTypeId, client);
      const activeIds = active.map((i) => i.id).sort((a, b) => a - b);
      const requested = [...orderedIds].sort((a, b) => a - b);
      const unique = new Set(orderedIds).size === orderedIds.length;
      if (!unique || activeIds.length !== requested.length || activeIds.some((id, i) => id !== requested[i])) {
        throw AppError.unprocessable('The new order must include every image exactly once');
      }
      await client.query(
        `UPDATE room_images AS i SET sort_order = o.position
           FROM UNNEST($2::bigint[]) WITH ORDINALITY AS o(id, position)
          WHERE i.id = o.id AND i.room_type_id = $1`,
        [roomTypeId, orderedIds],
      );
      await auditService.record(client, {
        actor,
        action: 'room_type.images_reordered',
        entity: 'room_type',
        entityId: roomTypeId,
        newValue: { order: orderedIds },
      });
    });
    return this.list(roomTypeId);
  },

  async remove(roomTypeId, imageId, actor) {
    const image = await withTransaction(async (client) => {
      await requireEditableRoom(client, roomTypeId);
      const existing = await roomTypeRepository.findImage(roomTypeId, imageId, client);
      if (!existing) throw AppError.notFound('Image not found');
      await client.query(`UPDATE room_images SET deleted_at = now(), is_cover = FALSE WHERE id = $1`, [imageId]);
      await auditService.record(client, {
        actor,
        action: 'room_type.image_removed',
        entity: 'room_type',
        entityId: roomTypeId,
        oldValue: { imageId },
      });
      return existing;
    });
    await getStorage()
      .remove(image.storage_key)
      .catch((error) => log.error('could not delete stored file', { storageKey: image.storage_key, message: error.message }));
  },
};
