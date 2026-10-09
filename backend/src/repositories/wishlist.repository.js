import { pool } from '../db/pool.js';

export const wishlistRepository = {
  async listForUser(userId) {
    const { rows } = await pool.query(
      `SELECT h.id, h.slug, h.name, h.city, h.area, h.country_code, h.property_type, h.star_rating, h.guest_rating,
              h.review_count, w.created_at AS saved_at,
              (SELECT json_build_object('storageKey', i.storage_key, 'sourceUrl', i.source_url, 'altText', i.alt_text, 'imageType', i.image_type)
                 FROM hotel_images i WHERE i.hotel_id = h.id AND i.deleted_at IS NULL
                ORDER BY i.is_cover DESC, i.sort_order ASC, i.id ASC LIMIT 1) AS cover,
              ARRAY(SELECT a.name FROM hotel_amenities ha JOIN amenities a ON a.id = ha.amenity_id
                     WHERE ha.hotel_id = h.id ORDER BY a.category, a.name LIMIT 4) AS top_amenities
         FROM wishlists w
         JOIN hotels h ON h.id = w.hotel_id
        WHERE w.user_id = $1 AND h.status = 'PUBLISHED' AND h.deleted_at IS NULL
        ORDER BY w.created_at DESC`,
      [userId],
    );
    return rows;
  },

  /** Adds a hotel only if it is published. Returns false when the hotel is not publicly visible. */
  async add(userId, hotelId) {
    const { rowCount } = await pool.query(
      `INSERT INTO wishlists (user_id, hotel_id)
       SELECT $1, h.id FROM hotels h WHERE h.id = $2 AND h.status = 'PUBLISHED' AND h.deleted_at IS NULL
       ON CONFLICT (user_id, hotel_id) DO NOTHING`,
      [userId, hotelId],
    );
    if (rowCount > 0) return true;
    const { rowCount: exists } = await pool.query(
      `SELECT 1 FROM wishlists WHERE user_id = $1 AND hotel_id = $2`,
      [userId, hotelId],
    );
    return exists > 0;
  },

  async remove(userId, hotelId) {
    await pool.query(`DELETE FROM wishlists WHERE user_id = $1 AND hotel_id = $2`, [userId, hotelId]);
  },

  async has(userId, hotelId) {
    if (!userId) return false;
    const { rowCount } = await pool.query(`SELECT 1 FROM wishlists WHERE user_id = $1 AND hotel_id = $2`, [userId, hotelId]);
    return rowCount > 0;
  },
};
