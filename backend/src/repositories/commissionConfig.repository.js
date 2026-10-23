import { pool } from '../db/pool.js';

function toConfig(row) {
  if (!row) return null;
  return {
    id: row.id,
    hotelId: row.hotel_id,
    ratePercent: Number(row.rate_percent),
    effectiveFrom: row.effective_from,
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export const commissionConfigRepository = {
  async insert(client, { hotelId = null, ratePercent, reason = null, createdBy }) {
    const { rows } = await client.query(
      `INSERT INTO commission_configs (hotel_id, rate_percent, reason, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [hotelId, ratePercent, reason, createdBy],
    );
    return rows[0].id;
  },

  /**
   * The resolved rate for a hotel at a point in time: the latest row (by effective_from) among the
   * platform default (hotel_id IS NULL) and that hotel's own override, preferring the hotel-specific
   * row whenever both exist. `hotel_id IS NOT NULL` (never itself NULL) avoids the NULL-ordering
   * ambiguity a plain `hotel_id = $1` comparison would have for the global row.
   */
  async resolveRate(hotelId, atTime, client = pool) {
    const { rows } = await client.query(
      `SELECT * FROM commission_configs
        WHERE effective_from <= $2 AND (hotel_id = $1 OR hotel_id IS NULL)
        ORDER BY (hotel_id IS NOT NULL) DESC, effective_from DESC
        LIMIT 1`,
      [hotelId, atTime],
    );
    return toConfig(rows[0]);
  },

  async historyForHotel(hotelId, client = pool) {
    const { rows } = await client.query(
      `SELECT * FROM commission_configs WHERE hotel_id = $1 ORDER BY effective_from DESC`,
      [hotelId],
    );
    return rows.map(toConfig);
  },

  async globalHistory(client = pool) {
    const { rows } = await client.query(
      `SELECT * FROM commission_configs WHERE hotel_id IS NULL ORDER BY effective_from DESC`,
    );
    return rows.map(toConfig);
  },
};
