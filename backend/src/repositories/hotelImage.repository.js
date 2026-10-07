import { pool } from '../db/pool.js';

const IMAGE_COLUMNS = `
  id, hotel_id, category, storage_key, source_url, source_provider, alt_text, mime_type,
  byte_size, origin, sort_order, is_cover, created_at
`;

export const hotelImageRepository = {
  async listActive(hotelId, client = pool) {
    const { rows } = await client.query(
      `SELECT ${IMAGE_COLUMNS} FROM hotel_images
        WHERE hotel_id = $1 AND deleted_at IS NULL
        ORDER BY is_cover DESC, sort_order ASC, id ASC`,
      [hotelId],
    );
    return rows;
  },

  async findActive(hotelId, imageId, client = pool) {
    const { rows } = await client.query(
      `SELECT ${IMAGE_COLUMNS} FROM hotel_images WHERE id = $1 AND hotel_id = $2 AND deleted_at IS NULL`,
      [imageId, hotelId],
    );
    return rows[0] ?? null;
  },

  async findBySourceUrl(hotelId, sourceUrl, client = pool) {
    const { rows } = await client.query(
      `SELECT id FROM hotel_images WHERE hotel_id = $1 AND source_url = $2 AND deleted_at IS NULL LIMIT 1`,
      [hotelId, sourceUrl],
    );
    return rows[0] ?? null;
  },

  async insert(client, values) {
    const columns = Object.keys(values);
    const { rows } = await client.query(
      `INSERT INTO hotel_images (${columns.join(', ')})
       VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})
       RETURNING id`,
      Object.values(values),
    );
    return rows[0].id;
  },

  async nextSortOrder(client, hotelId) {
    const { rows } = await client.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM hotel_images WHERE hotel_id = $1 AND deleted_at IS NULL`,
      [hotelId],
    );
    return rows[0].next;
  },

  async updateFields(client, imageId, changes) {
    const columns = Object.keys(changes);
    await client.query(
      `UPDATE hotel_images SET ${columns.map((column, index) => `${column} = $${index + 2}`).join(', ')} WHERE id = $1`,
      [imageId, ...Object.values(changes)],
    );
  },

  async clearCover(client, hotelId) {
    await client.query(`UPDATE hotel_images SET is_cover = FALSE WHERE hotel_id = $1 AND is_cover`, [hotelId]);
  },

  async softDelete(client, imageId) {
    await client.query(`UPDATE hotel_images SET deleted_at = now(), is_cover = FALSE WHERE id = $1`, [imageId]);
  },

  async setSortOrders(client, hotelId, orderedIds) {
    await client.query(
      `UPDATE hotel_images AS i
          SET sort_order = o.position
         FROM UNNEST($2::bigint[]) WITH ORDINALITY AS o(id, position)
        WHERE i.id = o.id AND i.hotel_id = $1`,
      [hotelId, orderedIds],
    );
  },

  /** Storage keys of uploads for a hotel, used to clean files up when a draft is discarded. */
  async listUploadKeys(hotelId, client = pool) {
    const { rows } = await client.query(
      `SELECT storage_key FROM hotel_images WHERE hotel_id = $1 AND origin = 'UPLOADED' AND storage_key IS NOT NULL`,
      [hotelId],
    );
    return rows.map((row) => row.storage_key);
  },
};
