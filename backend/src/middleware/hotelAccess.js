import { pool } from '../db/pool.js';
import { AppError } from '../utils/AppError.js';

/**
 * Per-hotel authorization for HOTEL_MANAGER. ADMIN always bypasses this (same rule as every other
 * admin action). A HOTEL_MANAGER must have a row in `hotel_managers` for the hotel the route touches,
 * resolved via `resolveHotelId(req)` since most admin routes are keyed by a room/plan/image/block id,
 * not the hotel id itself. A hotel a manager cannot access looks exactly like one that does not exist,
 * the same "hide, don't reveal" pattern already used for booking/payment/hold ownership checks.
 */
export function requireHotelAccess(resolveHotelId) {
  return async (req, _res, next) => {
    try {
      if (req.user.roles.includes('ADMIN')) return next();
      const hotelId = await resolveHotelId(req);
      if (hotelId == null) return next(AppError.notFound('Hotel not found'));
      const { rowCount } = await pool.query(
        `SELECT 1 FROM hotel_managers WHERE user_id = $1 AND hotel_id = $2`,
        [req.user.id, hotelId],
      );
      if (rowCount === 0) return next(AppError.notFound('Hotel not found'));
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** The route's own `:id` already is the hotel id. */
export const hotelIdFromParam = (req) => req.validated.params.id;

async function resolveFrom(sql, req) {
  const { rows } = await pool.query(sql, [req.validated.params.id]);
  return rows[0]?.hotel_id ?? null;
}

export const hotelIdFromRoomType = (req) => resolveFrom(`SELECT hotel_id FROM room_types WHERE id = $1`, req);
export const hotelIdFromCancellationPolicy = (req) => resolveFrom(`SELECT hotel_id FROM cancellation_policies WHERE id = $1`, req);
export const hotelIdFromRatePlan = (req) => resolveFrom(`SELECT hotel_id FROM rate_plans WHERE id = $1`, req);
export const hotelIdFromBlock = (req) =>
  resolveFrom(`SELECT rt.hotel_id FROM availability_blocks b JOIN room_types rt ON rt.id = b.room_type_id WHERE b.id = $1`, req);

/**
 * Import jobs reach this check before they may have resolved to a hotel yet (PENDING/PROCESSING).
 * A HOTEL_MANAGER may always see their own job; once it has resolved to a hotel, the normal
 * per-hotel assignment rule also applies (covers a manager reviewing someone else's completed job).
 */
export async function requireImportJobAccess(req, _res, next) {
  try {
    if (req.user.roles.includes('ADMIN')) return next();
    const { rows } = await pool.query(`SELECT created_by, hotel_id FROM hotel_import_jobs WHERE id = $1`, [req.validated.params.id]);
    const job = rows[0];
    if (!job) return next(AppError.notFound('Import job not found'));
    if (job.created_by === req.user.id) return next();
    if (job.hotel_id != null) {
      const { rowCount } = await pool.query(`SELECT 1 FROM hotel_managers WHERE user_id = $1 AND hotel_id = $2`, [req.user.id, job.hotel_id]);
      if (rowCount > 0) return next();
    }
    return next(AppError.notFound('Import job not found'));
  } catch (error) {
    next(error);
  }
}

/**
 * Grants the creator access to a hotel they just created or imported, so they're never locked out of
 * their own work. Harmless to also record for an ADMIN creator (it bypasses the check either way) —
 * simpler than branching on role, and keeps a record of who actually created the hotel.
 */
export async function assignManagerIfNeeded(client, { creatorId, hotelId }) {
  await client.query(
    `INSERT INTO hotel_managers (user_id, hotel_id, assigned_by) VALUES ($1, $2, $1) ON CONFLICT DO NOTHING`,
    [creatorId, hotelId],
  );
}
