import { createHash, randomUUID } from 'node:crypto';
import { pool, withTransaction } from '../db/pool.js';
import { getStorage } from '../storage/index.js';
import { detectImageType } from '../utils/imageSignature.js';
import { AppError } from '../utils/AppError.js';
import { auditService } from './audit.service.js';

const dto = (row) => ({
  slot: row.slot,
  url: getStorage().publicUrl(row.storage_key),
  altText: row.alt_text,
  mimeType: row.mime_type,
  byteSize: row.byte_size,
  updatedAt: row.updated_at,
});

export const homepageBackgroundService = {
  async list() {
    const { rows } = await pool.query(`SELECT * FROM homepage_background_images ORDER BY slot`);
    return rows.map(dto);
  },

  async replace(slot, file, altText, actor) {
    if (!file?.buffer?.length) throw AppError.badRequest('Choose an image to upload');
    const cleanAltText = typeof altText === 'string' ? altText.trim() : '';
    if (cleanAltText.length > 160) {
      throw AppError.unprocessable('Accessibility description must be 160 characters or fewer');
    }
    const detected = detectImageType(file.buffer);
    if (!detected) throw AppError.unsupportedMediaType('The file is not a valid JPEG, PNG or WebP image');
    if (detected.mime !== file.mimetype) throw AppError.unsupportedMediaType('The file contents do not match its declared type');

    const storage = getStorage();
    const storageKey = `homepage/${slot}/${randomUUID()}.${detected.ext}`;
    await storage.put(storageKey, file.buffer);
    let oldKey = null;
    try {
      const row = await withTransaction(async (client) => {
        const current = await client.query(`SELECT * FROM homepage_background_images WHERE slot = $1 FOR UPDATE`, [slot]);
        oldKey = current.rows[0]?.storage_key ?? null;
        const contentHash = createHash('sha256').update(file.buffer).digest('hex');
        const { rows } = await client.query(
          `INSERT INTO homepage_background_images (slot, storage_key, alt_text, mime_type, byte_size, content_hash, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (slot) DO UPDATE SET storage_key = EXCLUDED.storage_key, alt_text = EXCLUDED.alt_text,
             mime_type = EXCLUDED.mime_type, byte_size = EXCLUDED.byte_size, content_hash = EXCLUDED.content_hash,
             created_by = EXCLUDED.created_by, updated_at = now()
           RETURNING *`,
          [slot, storageKey, cleanAltText, detected.mime, file.buffer.length, contentHash, actor.id],
        );
        await auditService.record(client, { actor, action: 'homepage.background_updated', entity: 'homepage_background', entityId: slot, newValue: { slot, altText: cleanAltText } });
        return rows[0];
      });
      if (oldKey && oldKey !== storageKey) await storage.remove(oldKey).catch(() => {});
      return dto(row);
    } catch (error) {
      await storage.remove(storageKey).catch(() => {});
      throw error;
    }
  },

  async remove(slot, actor) {
    let storageKey = null;
    await withTransaction(async (client) => {
      const { rows } = await client.query(`DELETE FROM homepage_background_images WHERE slot = $1 RETURNING storage_key`, [slot]);
      if (!rows[0]) throw AppError.notFound('Homepage background image not found');
      storageKey = rows[0].storage_key;
      await auditService.record(client, { actor, action: 'homepage.background_removed', entity: 'homepage_background', entityId: slot, oldValue: { slot } });
    });
    await getStorage().remove(storageKey).catch(() => {});
  },
};

