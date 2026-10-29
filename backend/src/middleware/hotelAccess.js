import { pool } from '../db/pool.js';
import { AppError } from '../utils/AppError.js';

/**
 * Per-hotel authorization for HOTEL_MANAGER. ADMIN and HOTEL_ONBOARDING_EXECUTIVE always bypass
 * this because both roles manage the hotel onboarding lifecycle across the catalogue. A
 * HOTEL_MANAGER must have a row in `hotel_managers` for the hotel the route touches,
 * resolved via `resolveHotelId(req)` since most admin routes are keyed by a room/plan/image/block id,
 * not the hotel id itself. A hotel a manager cannot access looks exactly like one that does not exist,
 * the same "hide, don't reveal" pattern already used for booking/payment/hold ownership checks.
 */
export function requireHotelAccess(resolveHotelId) {
  return async (req, _res, next) => {
    try {
      if (req.user.roles.some((role) => ['ADMIN', 'HOTEL_ONBOARDING_EXECUTIVE'].includes(role))) return next();
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

/** Onboarding executives may inspect every hotel to avoid duplicates, but write middleware remains assignment-scoped. */
export function requireHotelReadAccess(resolveHotelId) {
  return async (req, res, next) => {
    if (req.user.roles.some((role) => ['HOTEL_ONBOARDING_EXECUTIVE', 'HOTEL_REVIEW_EXECUTIVE'].includes(role))) return next();
    return requireHotelAccess(resolveHotelId)(req, res, next);
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
 * Staff may always see their own job; once it has resolved to a hotel, the appropriate per-hotel
 * assignment also applies (manager assignments for operational staff, onboarding assignments for
 * onboarding executives). This supports an explicit handover without exposing the job to unassigned staff.
 */
export async function requireImportJobAccess(req, _res, next) {
  try {
    if (req.user.roles.includes('ADMIN')) return next();
    const { rows } = await pool.query(`SELECT created_by, hotel_id FROM hotel_import_jobs WHERE id = $1`, [req.validated.params.id]);
    const job = rows[0];
    if (!job) return next(AppError.notFound('Import job not found'));
    if (job.created_by === req.user.id) return next();
    if (job.hotel_id != null) {
      // Review executives may inspect the source/logs behind a submitted hotel. Their specialized
      // route allow-list permits GET detail only and continues to block import/discard mutations.
      if (req.user.roles.includes('HOTEL_REVIEW_EXECUTIVE')) return next();
      const canUseManagerAssignment = req.user.roles.some((role) => ['HOTEL_MANAGER', 'HOTEL_OWNER'].includes(role));
      const canUseOnboardingAssignment = req.user.roles.includes('HOTEL_ONBOARDING_EXECUTIVE');
      const { rowCount } = await pool.query(
        `SELECT 1
           WHERE ($3::boolean AND EXISTS (
                    SELECT 1 FROM hotel_managers WHERE user_id = $1 AND hotel_id = $2
                  ))
              OR ($4::boolean AND EXISTS (
                    SELECT 1 FROM hotel_onboarding_assignments WHERE user_id = $1 AND hotel_id = $2
                  ))`,
        [req.user.id, job.hotel_id, canUseManagerAssignment, canUseOnboardingAssignment],
      );
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
  const { rows } = await client.query(
    `SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
    [creatorId],
  );
  const table = rows.some((row) => row.code === 'HOTEL_ONBOARDING_EXECUTIVE')
    ? 'hotel_onboarding_assignments'
    : 'hotel_managers';
  await client.query(`INSERT INTO ${table} (user_id, hotel_id, assigned_by) VALUES ($1, $2, $1) ON CONFLICT DO NOTHING`, [creatorId, hotelId]);
}
