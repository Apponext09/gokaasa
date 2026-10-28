import { pool, withTransaction } from '../db/pool.js';
import { hotelRepository } from '../repositories/hotel.repository.js';
import { auditService } from './audit.service.js';
import { notificationService } from '../notifications/notificationService.js';
import { AppError } from '../utils/AppError.js';
import { emailNotificationService } from './emailNotification.service.js';

export const managerService = {
  async listOnboardingForHotel(hotelId) {
    const { rows } = await pool.query(
      `SELECT u.id, u.email::text AS email, u.first_name, u.last_name, hoa.assigned_at
         FROM hotel_onboarding_assignments hoa JOIN users u ON u.id = hoa.user_id
        WHERE hoa.hotel_id = $1 ORDER BY hoa.assigned_at DESC`,
      [hotelId],
    );
    return rows.map((row) => ({ userId: row.id, email: row.email, firstName: row.first_name, lastName: row.last_name, assignedAt: row.assigned_at }));
  },

  async listOnboardingExecutives() {
    const { rows } = await pool.query(
      `SELECT u.id, u.email::text AS email, u.first_name, u.last_name
         FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
        WHERE r.code = 'HOTEL_ONBOARDING_EXECUTIVE' AND u.is_active AND u.deleted_at IS NULL
        ORDER BY u.first_name, u.last_name, u.id`,
    );
    return rows.map((row) => ({ id: row.id, email: row.email, firstName: row.first_name, lastName: row.last_name }));
  },

  async assignOnboarding(hotelId, userId, actor) {
    const hotel = await hotelRepository.findById(hotelId, {});
    if (!hotel) throw AppError.notFound('Hotel not found');
    const { rowCount } = await pool.query(
      `SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
        WHERE u.id = $1 AND u.is_active AND u.deleted_at IS NULL AND r.code = 'HOTEL_ONBOARDING_EXECUTIVE'`,
      [userId],
    );
    if (!rowCount) throw AppError.unprocessable('Only an active hotel onboarding executive can be assigned');
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO hotel_onboarding_assignments (user_id, hotel_id, assigned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [userId, hotelId, actor.id],
      );
      await auditService.record(client, { actor, action: 'hotel.onboarding_executive_assigned', entity: 'hotel', entityId: hotelId, newValue: { userId } });
    });
    return this.listOnboardingForHotel(hotelId);
  },

  async unassignOnboarding(hotelId, userId, actor) {
    await withTransaction(async (client) => {
      await client.query(`DELETE FROM hotel_onboarding_assignments WHERE hotel_id = $1 AND user_id = $2`, [hotelId, userId]);
      await auditService.record(client, { actor, action: 'hotel.onboarding_executive_unassigned', entity: 'hotel', entityId: hotelId, oldValue: { userId } });
    });
    return this.listOnboardingForHotel(hotelId);
  },

  async listForHotel(hotelId) {
    const { rows } = await pool.query(
      `SELECT u.id, u.email::text AS email, u.first_name, u.last_name, hm.assigned_at
         FROM hotel_managers hm JOIN users u ON u.id = hm.user_id
        WHERE hm.hotel_id = $1
        ORDER BY hm.assigned_at DESC`,
      [hotelId],
    );
    return rows.map((row) => ({ userId: row.id, email: row.email, firstName: row.first_name, lastName: row.last_name, assignedAt: row.assigned_at }));
  },

  async assign(hotelId, userId, actor) {
    const hotel = await hotelRepository.findById(hotelId, {});
    if (!hotel) throw AppError.notFound('Hotel not found');

    const { rows } = await pool.query(
      `SELECT u.id, u.email::text AS email, u.first_name, u.last_name, r.code FROM users u
        JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId],
    );
    if (rows.length === 0) throw AppError.notFound('User not found');
    if (!rows.some((row) => ['HOTEL_MANAGER', 'HOTEL_OWNER'].includes(row.code))) {
      throw AppError.unprocessable('Only a hotel manager or approved hotel owner can be assigned to a hotel');
    }

    const inserted = await withTransaction(async (client) => {
      const assignment = await client.query(
        `INSERT INTO hotel_managers (user_id, hotel_id, assigned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING user_id`,
        [userId, hotelId, actor.id],
      );
      if (assignment.rowCount === 0) return false;
      const account = { id: userId, email: rows[0].email, firstName: rows[0].first_name, lastName: rows[0].last_name };
      await emailNotificationService.enqueueHotelOnboarded(client, account, hotel);
      await auditService.record(client, {
        actor,
        action: 'hotel.manager_assigned',
        entity: 'hotel',
        entityId: hotelId,
        newValue: { userId },
      });
      return true;
    });
    if (inserted) {
      await emailNotificationService.processEvent(`hotel.onboarded:${hotel.id}:${userId}`);
      notificationService.sendManagerAssigned(userId, hotel).catch(() => {});
    }
    return this.listForHotel(hotelId);
  },

  async unassign(hotelId, userId, actor) {
    await withTransaction(async (client) => {
      await client.query(`DELETE FROM hotel_managers WHERE hotel_id = $1 AND user_id = $2`, [hotelId, userId]);
      await auditService.record(client, {
        actor,
        action: 'hotel.manager_unassigned',
        entity: 'hotel',
        entityId: hotelId,
        oldValue: { userId },
      });
    });
    return this.listForHotel(hotelId);
  },

  /**
   * Every HOTEL_MANAGER account. Used as the flat assignment picker (unfiltered) and, with the same
   * shape plus `hotels`, as the admin Managers directory -- additive fields only, so the picker is unaffected.
   */
  async listManagers(query) {
    const params = ['HOTEL_MANAGER'];
    let where = `r.code = $1`;
    if (query.q) {
      params.push(`%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      where += ` AND (u.email ILIKE $${params.length} OR u.first_name ILIKE $${params.length} OR u.last_name ILIKE $${params.length})`;
    }
    const { rows } = await pool.query(
      `SELECT DISTINCT u.id, u.email::text AS email, u.first_name, u.last_name, u.created_at,
              ARRAY(SELECT jsonb_build_object('id', h.id, 'name', h.name)
                      FROM hotel_managers hm JOIN hotels h ON h.id = hm.hotel_id
                     WHERE hm.user_id = u.id ORDER BY h.name) AS hotels
         FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
        WHERE ${where} AND u.deleted_at IS NULL
        ORDER BY u.first_name, u.last_name`,
      params,
    );
    return rows.map((row) => ({
      id: row.id, email: row.email, firstName: row.first_name, lastName: row.last_name,
      createdAt: row.created_at, hotels: row.hotels ?? [],
    }));
  },

  /** ADMIN only (enforced at the route). Assigned hotels plus recent activity across exactly those hotels. */
  async detail(userId) {
    const user = await pool.query(
      `SELECT u.id, u.email::text AS email, u.first_name, u.last_name, u.created_at
         FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
        WHERE u.id = $1 AND r.code = 'HOTEL_MANAGER' AND u.deleted_at IS NULL`,
      [userId],
    );
    if (user.rows.length === 0) throw AppError.notFound('Manager not found');

    const hotelRows = await pool.query(
      `SELECT h.id, h.name, h.city, h.status, hm.assigned_at
         FROM hotel_managers hm JOIN hotels h ON h.id = hm.hotel_id
        WHERE hm.user_id = $1
        ORDER BY hm.assigned_at DESC`,
      [userId],
    );
    const hotelIds = hotelRows.rows.map((row) => row.id);

    const [bookingStats, recentBookings, reviewStats] = await Promise.all([
      hotelIds.length === 0
        ? { total: 0, revenue_minor: 0 }
        : pool
          .query(
            `SELECT COUNT(*)::int AS total, COALESCE(SUM(total_minor) FILTER (WHERE status NOT IN ('INITIATED', 'FAILED')), 0)::bigint AS revenue_minor
               FROM bookings WHERE hotel_id = ANY($1::bigint[])`,
            [hotelIds],
          )
          .then((r) => r.rows[0]),
      hotelIds.length === 0
        ? []
        : pool
          .query(
            `SELECT b.id, b.booking_ref, b.status, b.hotel_name, b.total_minor, b.created_at
               FROM bookings b WHERE b.hotel_id = ANY($1::bigint[])
              ORDER BY b.created_at DESC LIMIT 5`,
            [hotelIds],
          )
          .then((r) => r.rows),
      hotelIds.length === 0
        ? { total: 0, pending: 0 }
        : pool
          .query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending FROM reviews WHERE hotel_id = ANY($1::bigint[])`, [hotelIds])
          .then((r) => r.rows[0]),
    ]);

    return {
      id: user.rows[0].id,
      email: user.rows[0].email,
      firstName: user.rows[0].first_name,
      lastName: user.rows[0].last_name,
      createdAt: user.rows[0].created_at,
      hotels: hotelRows.rows.map((row) => ({ id: row.id, name: row.name, city: row.city, status: row.status, assignedAt: row.assigned_at })),
      bookings: { total: bookingStats.total, revenueMinor: Number(bookingStats.revenue_minor) },
      reviews: { total: reviewStats.total, pending: reviewStats.pending },
      recentBookings: recentBookings.map((row) => ({ id: row.id, bookingRef: row.booking_ref, status: row.status, hotelName: row.hotel_name, totalMinor: Number(row.total_minor), createdAt: row.created_at })),
    };
  },
};
