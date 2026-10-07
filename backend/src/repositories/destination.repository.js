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
      `SELECT city, country_code, COUNT(*)::int AS hotel_count
         FROM hotels WHERE status = 'PUBLISHED' AND deleted_at IS NULL
        GROUP BY city, country_code
        ORDER BY hotel_count DESC, city ASC
        LIMIT $1`,
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
