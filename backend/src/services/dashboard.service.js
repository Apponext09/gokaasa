import { pool } from '../db/pool.js';
import { hotelRepository } from '../repositories/hotel.repository.js';
import { hotelImportRepository } from '../repositories/hotelImport.repository.js';

/** Every figure is read from the database. Nothing here is hardcoded or estimated. */
export const dashboardService = {
  async summary() {
    const [hotelCounts, onboarding, roomCount, customerCount, bookingStats] = await Promise.all([
      hotelRepository.countByStatus(),
      hotelImportRepository.onboardingMetrics(),
      pool.query(`SELECT COALESCE(SUM(total_units), 0)::int AS count FROM room_types WHERE deleted_at IS NULL AND status = 'ACTIVE'`).then((r) => r.rows[0].count),
      pool
        .query(
          `SELECT COUNT(DISTINCT ur.user_id)::int AS count
             FROM user_roles ur JOIN roles r ON r.id = ur.role_id
            WHERE r.code = 'CUSTOMER'`,
        )
        .then((r) => r.rows[0].count),
      pool
        .query(
          `SELECT
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today,
             COALESCE(SUM(total_minor) FILTER (WHERE status IN ('PAID', 'CONFIRMED')), 0)::bigint AS revenue_minor
           FROM bookings`,
        )
        .then((r) => r.rows[0]),
    ]);

    const hotelTotal = Object.values(hotelCounts).reduce((sum, count) => sum + count, 0);
    const pendingVerification = await pool
      .query(
        `SELECT COUNT(*)::int AS count FROM hotels
          WHERE external_provider IS NOT NULL AND deleted_at IS NULL AND status IN ('DRAFT', 'PENDING_REVIEW')`,
      )
      .then((r) => r.rows[0].count);

    return {
      hotels: {
        total: hotelTotal,
        published: hotelCounts.PUBLISHED ?? 0,
        drafts: hotelCounts.DRAFT ?? 0,
        pendingReview: hotelCounts.PENDING_REVIEW ?? 0,
        readyToPublish: hotelCounts.READY_TO_PUBLISH ?? 0,
        unpublished: hotelCounts.UNPUBLISHED ?? 0,
        archived: hotelCounts.ARCHIVED ?? 0,
      },
      rooms: { total: roomCount },
      customers: { total: customerCount },
      bookings: {
        total: bookingStats.total,
        today: bookingStats.today,
        revenueMinor: Number(bookingStats.revenue_minor),
        currency: 'INR',
      },
      onboarding: {
        importedToday: onboarding.imported_today,
        pendingVerification,
        published: hotelCounts.PUBLISHED ?? 0,
        failedImports30d: onboarding.failed_30d,
        completedImports30d: onboarding.completed_30d,
        // Time from job creation to a draft existing. Admin verification time is not included.
        averageImportMinutes30d: onboarding.avg_minutes_30d == null ? null : Number(onboarding.avg_minutes_30d),
      },
    };
  },
};
