import { pool } from '../db/pool.js';

/**
 * Nightly inventory facts for room types over a set of nights. Availability is never stored: this query
 * derives blocked and reserved counts from their own tables on every call.
 */
export const inventoryRepository = {
  async nightlyFacts(roomTypeIds, nights, client = pool) {
    if (roomTypeIds.length === 0 || nights.length === 0) return [];
    const { rows } = await client.query(
      `SELECT rt.id AS room_type_id, n.stay_date::text AS stay_date, rt.total_units,
              NULL::integer AS units_override,
              FALSE AS is_closed,
              NULL::smallint AS min_stay, NULL::smallint AS max_stay,
              COALESCE((SELECT SUM(b.quantity) FROM availability_blocks b
                         WHERE b.room_type_id = rt.id AND b.is_active
                           AND n.stay_date >= b.start_date AND n.stay_date < b.end_date), 0)::int AS blocked,
              COALESCE((SELECT SUM(r.quantity) FROM inventory_reservations r
                         WHERE r.room_type_id = rt.id AND r.stay_date = n.stay_date
                           AND (r.status = 'CONFIRMED' OR (r.status = 'HELD' AND r.expires_at > now()))), 0)::int AS reserved
         FROM room_types rt
         CROSS JOIN UNNEST($2::date[]) AS n(stay_date)
        WHERE rt.id = ANY($1::bigint[])
        ORDER BY rt.id, n.stay_date`,
      [roomTypeIds, nights],
    );
    return rows;
  },

  /** Upserts only the settings whose flags are true, so a bulk edit never clears unrelated fields. */
  async upsertSettings(client, roomTypeId, dates, settings) {
    await client.query(
      `INSERT INTO room_inventory (room_type_id, stay_date, units, is_closed, min_stay, max_stay, updated_at)
       SELECT $1::bigint, d, $3::int, COALESCE($4::boolean, FALSE), $5::smallint, $6::smallint, now() FROM UNNEST($2::date[]) AS d
       ON CONFLICT (room_type_id, stay_date) DO UPDATE SET
         units = CASE WHEN $7::boolean THEN EXCLUDED.units ELSE room_inventory.units END,
         is_closed = CASE WHEN $8::boolean THEN EXCLUDED.is_closed ELSE room_inventory.is_closed END,
         min_stay = CASE WHEN $9::boolean THEN EXCLUDED.min_stay ELSE room_inventory.min_stay END,
         max_stay = CASE WHEN $10::boolean THEN EXCLUDED.max_stay ELSE room_inventory.max_stay END,
         updated_at = now()`,
      [
        roomTypeId,
        dates,
        settings.units ?? null,
        settings.isClosed ?? null,
        settings.minStay ?? null,
        settings.maxStay ?? null,
        settings.setUnits === true,
        settings.setClosed === true,
        settings.setMinStay === true,
        settings.setMaxStay === true,
      ],
    );
  },

  async insertBlock(client, values) {
    const { rows } = await client.query(
      `INSERT INTO availability_blocks (room_type_id, start_date, end_date, quantity, reason, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [values.roomTypeId, values.startDate, values.endDate, values.quantity, values.reason, values.note ?? null, values.createdBy],
    );
    return rows[0].id;
  },

  async listActiveBlocks(roomTypeId, client = pool) {
    const { rows } = await client.query(
      `SELECT id, room_type_id, start_date::text, end_date::text, quantity, reason, note, created_at
         FROM availability_blocks WHERE room_type_id = $1 AND is_active ORDER BY start_date, id`,
      [roomTypeId],
    );
    return rows;
  },

  async findBlock(blockId, client = pool) {
    const { rows } = await client.query(
      `SELECT id, room_type_id, start_date::text, end_date::text, quantity, is_active FROM availability_blocks WHERE id = $1`,
      [blockId],
    );
    return rows[0] ?? null;
  },

  async deactivateBlock(client, blockId) {
    await client.query(`UPDATE availability_blocks SET is_active = FALSE, updated_at = now() WHERE id = $1`, [blockId]);
  },

  /**
   * One reservation row per night. A booking hold passes holdId so the row shares the hold's expiry and can
   * be released or converted with it. Without a hold, the row expires after holdMinutes.
   */
  async insertHold(client, { roomTypeId, stayDate, quantity, holdMinutes = 5, holdId = null }) {
    await client.query(
      `INSERT INTO inventory_reservations (room_type_id, stay_date, quantity, status, expires_at, hold_id)
       VALUES ($1, $2, $3, 'HELD',
               COALESCE((SELECT expires_at FROM booking_holds WHERE id = $5), now() + ($4 || ' minutes')::interval),
               $5)`,
      [roomTypeId, stayDate, quantity, String(holdMinutes), holdId],
    );
  },

  /** Reservations that would keep a room type from being sold on or after `fromDate`. */
  async futureReservationCount(roomTypeId, fromDate, client = pool) {
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS count FROM inventory_reservations
        WHERE room_type_id = $1 AND stay_date >= $2 AND (status = 'CONFIRMED' OR (status = 'HELD' AND expires_at > now()))`,
      [roomTypeId, fromDate],
    );
    return rows[0].count;
  },

  async calendarSettings(roomTypeId, from, to, client = pool) {
    const { rows } = await client.query(
      `SELECT stay_date::text AS stay_date, units, is_closed, min_stay, max_stay
         FROM room_inventory WHERE room_type_id = $1 AND stay_date BETWEEN $2 AND $3`,
      [roomTypeId, from, to],
    );
    return rows;
  },
};
