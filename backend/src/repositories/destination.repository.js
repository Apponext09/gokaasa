import { pool } from '../db/pool.js';

/** Published hotels only, so destinations never reveal drafts, unpublished or archived hotels. */
export const destinationRepository = {
  /** Distinct published cities and areas. Small enough to resolve slugs in memory. */
  async publishedPlaces() {
    const { rows } = await pool.query(
      `SELECT DISTINCT city, area FROM hotels WHERE status = 'PUBLISHED' AND deleted_at IS NULL`,
    );
    return rows;
  },

  /** Suggestions for the destination box: cities, areas and hotel names matching the typed text. */
  async suggest(text, limit = 8) {
    const pattern = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const { rows } = await pool.query(
      `(SELECT 'CITY' AS type, city AS label, city, country_code, NULL::text AS slug, COUNT(*)::int AS hotel_count
          FROM hotels WHERE status = 'PUBLISHED' AND deleted_at IS NULL AND city ILIKE $1
         GROUP BY city, country_code ORDER BY hotel_count DESC, city LIMIT 4)
       UNION ALL
       (SELECT 'AREA' AS type, area AS label, city, country_code, NULL::text AS slug, COUNT(*)::int AS hotel_count
          FROM hotels WHERE status = 'PUBLISHED' AND deleted_at IS NULL AND area IS NOT NULL AND area ILIKE $1
         GROUP BY area, city, country_code ORDER BY hotel_count DESC, area LIMIT 4)
       UNION ALL
       (SELECT 'HOTEL' AS type, name AS label, city, country_code, slug, 1 AS hotel_count
          FROM hotels WHERE status = 'PUBLISHED' AND deleted_at IS NULL AND name ILIKE $1
         ORDER BY guest_rating DESC NULLS LAST, name LIMIT 5)
       LIMIT $2`,
      [pattern, limit],
    );
    return rows;
  },

  /** Cities with the most published hotels, for the homepage. */
  async popularCities(limit = 6) {
    const { rows } = await pool.query(
      `WITH cities AS (
         SELECT city, country_code, COUNT(*)::int AS hotel_count
           FROM hotels
          WHERE status = 'PUBLISHED' AND deleted_at IS NULL
          GROUP BY city, country_code
          ORDER BY hotel_count DESC, city ASC
          LIMIT $1
       )
       SELECT c.*,
              cover.image AS cover
         FROM cities c
         LEFT JOIN LATERAL (
           SELECT json_build_object(
                    'storageKey', i.storage_key,
                    'sourceUrl', i.source_url,
                    'altText', i.alt_text,
                    'imageType', i.image_type
                  ) AS image
             FROM hotels h
             JOIN hotel_images i ON i.hotel_id = h.id AND i.deleted_at IS NULL
            WHERE h.status = 'PUBLISHED' AND h.deleted_at IS NULL
              AND lower(h.city) = lower(c.city) AND h.country_code = c.country_code
            ORDER BY i.is_cover DESC, h.guest_rating DESC NULLS LAST, i.sort_order ASC, i.id ASC
            LIMIT 1
         ) cover ON TRUE
        ORDER BY c.hotel_count DESC, c.city ASC`,
      [limit],
    );
    return rows;
  },

  /** Published property types and a representative real hotel image for each homepage category. */
  async popularPropertyTypes(limit = 6) {
    const { rows } = await pool.query(
      `WITH property_types AS (
         SELECT property_type, COUNT(*)::int AS hotel_count
           FROM hotels
          WHERE status = 'PUBLISHED' AND deleted_at IS NULL
          GROUP BY property_type
          ORDER BY hotel_count DESC, property_type ASC
          LIMIT $1
       )
       SELECT p.*,
              cover.image AS cover
         FROM property_types p
         LEFT JOIN LATERAL (
           SELECT json_build_object(
                    'storageKey', i.storage_key,
                    'sourceUrl', i.source_url,
                    'altText', i.alt_text,
                    'imageType', i.image_type
                  ) AS image
             FROM hotels h
             JOIN hotel_images i ON i.hotel_id = h.id AND i.deleted_at IS NULL
            WHERE h.status = 'PUBLISHED' AND h.deleted_at IS NULL
              AND h.property_type = p.property_type
            ORDER BY i.is_cover DESC, h.guest_rating DESC NULLS LAST, i.sort_order ASC, i.id ASC
            LIMIT 1
         ) cover ON TRUE
        ORDER BY p.hotel_count DESC, p.property_type ASC`,
      [limit],
    );
    return rows;
  },

  /** Areas with the most published hotels and a real cover image, for the homepage area grid. */
  async popularAreas(limit = 8) {
    const { rows } = await pool.query(
      `WITH areas AS (
         SELECT area, city, country_code, COUNT(*)::int AS hotel_count
           FROM hotels
          WHERE status = 'PUBLISHED'
            AND deleted_at IS NULL
            AND area IS NOT NULL
            AND trim(area) != ''
          GROUP BY area, city, country_code
          ORDER BY hotel_count DESC, area ASC
          LIMIT $1
       )
       SELECT a.*,
              cover.image AS cover
         FROM areas a
         LEFT JOIN LATERAL (
           SELECT json_build_object(
                    'storageKey', i.storage_key,
                    'sourceUrl', i.source_url,
                    'altText', i.alt_text,
                    'imageType', i.image_type
                  ) AS image
             FROM hotels h
             JOIN hotel_images i ON i.hotel_id = h.id AND i.deleted_at IS NULL
            WHERE h.status = 'PUBLISHED' AND h.deleted_at IS NULL
              AND lower(h.area) = lower(a.area)
              AND lower(h.city) = lower(a.city)
            ORDER BY i.is_cover DESC, h.guest_rating DESC NULLS LAST, i.sort_order ASC, i.id ASC
            LIMIT 1
         ) cover ON TRUE
        ORDER BY a.hotel_count DESC, a.area ASC`,
      [limit],
    );
    return rows;
  },

  /** How many distinct cities and countries have a published hotel, for the homepage trust strip. */
  async coverage() {
    const { rows } = await pool.query(
      `SELECT COUNT(DISTINCT city)::int AS cities, COUNT(DISTINCT country_code)::int AS countries
         FROM hotels WHERE status = 'PUBLISHED' AND deleted_at IS NULL`,
    );
    return rows[0];
  },
};
