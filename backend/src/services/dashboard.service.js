import { pool } from '../db/pool.js';
import { hotelRepository } from '../repositories/hotel.repository.js';
import { hotelImportRepository } from '../repositories/hotelImport.repository.js';

/** Resolves to the manager's own user id (to scope by `hotel_managers`), or null for ADMIN (no scoping). */
function managerScopeOf(actor) {
  return actor?.roles.includes('ADMIN') ? null : actor?.id ?? null;
}

/** `hotel_id = ANY($n)` for a manager scoped to a (possibly empty) set of hotels, else no filter at all. */
function hotelIdFilter(column, hotelIds, params) {
  if (hotelIds == null) return '';
  params.push(hotelIds);
  return `AND ${column} = ANY($${params.length}::bigint[])`;
}

/** Every figure is read from the database. Nothing here is hardcoded or estimated. */
export const dashboardService = {
  async summary(actor) {
    const managerUserId = managerScopeOf(actor);
    const hotelIds = managerUserId == null ? null : await hotelRepository.managedHotelIds(managerUserId);

    const bookingParams = [];
    const bookingFilter = hotelIdFilter('hotel_id', hotelIds, bookingParams);

    const [hotelCounts, onboarding, roomCount, customerCount, bookingStats] = await Promise.all([
      hotelRepository.countByStatus(pool, managerUserId),
      hotelImportRepository.onboardingMetrics({ createdBy: managerUserId }),
      hotelIds == null
        ? pool.query(`SELECT COALESCE(SUM(total_units), 0)::int AS count FROM room_types WHERE deleted_at IS NULL AND status = 'ACTIVE'`).then((r) => r.rows[0].count)
        : pool
          .query(
            `SELECT COALESCE(SUM(total_units), 0)::int AS count FROM room_types
              WHERE deleted_at IS NULL AND status = 'ACTIVE' AND hotel_id = ANY($1::bigint[])`,
            [hotelIds],
          )
          .then((r) => r.rows[0].count),
      hotelIds == null
        ? pool
          .query(`SELECT COUNT(DISTINCT ur.user_id)::int AS count FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.code = 'CUSTOMER'`)
          .then((r) => r.rows[0].count)
        : pool
          .query(`SELECT COUNT(DISTINCT user_id)::int AS count FROM bookings WHERE hotel_id = ANY($1::bigint[])`, [hotelIds])
          .then((r) => r.rows[0].count),
      pool
        .query(
          `SELECT
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today,
             COALESCE(SUM(total_minor) FILTER (WHERE status IN ('PAID', 'CONFIRMED')), 0)::bigint AS revenue_minor
           FROM bookings WHERE TRUE ${bookingFilter}`,
          bookingParams,
        )
        .then((r) => r.rows[0]),
    ]);

    const hotelTotal = Object.values(hotelCounts).reduce((sum, count) => sum + count, 0);
    const pendingParams = [];
    const pendingFilter = hotelIdFilter('h.id', hotelIds, pendingParams);
    const pendingVerification = await pool
      .query(
        `SELECT COUNT(*)::int AS count FROM hotels h
          WHERE h.external_provider IS NOT NULL AND h.deleted_at IS NULL AND h.status IN ('DRAFT', 'PENDING_REVIEW') ${pendingFilter}`,
        pendingParams,
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
        averageImportMinutes30d: onboarding.avg_minutes_30d == null ? null : Number(onboarding.avg_minutes_30d),
      },
    };
  },

  /**
   * Day-by-day booking/revenue series, a booking-status breakdown, and top hotels, all for one date
   * range. One round trip per chart rather than the browser computing any of this from raw rows.
   */
  async trends({ from, to }, actor) {
    const managerUserId = managerScopeOf(actor);
    const hotelIds = managerUserId == null ? null : await hotelRepository.managedHotelIds(managerUserId);
    const scopedTo = (hotelIds ?? []).length === 0 && managerUserId != null;
    // A manager with no assigned hotels gets honestly-empty series, not another manager's data.
    const hotelArray = scopedTo ? [-1] : hotelIds;

    const bookingSeriesParams = [from, to];
    const bookingSeriesFilter = hotelIdFilter('b.hotel_id', hotelArray, bookingSeriesParams);
    const bookingSeries = await pool
      .query(
        `SELECT to_char(d.day, 'YYYY-MM-DD') AS date, COUNT(b.id)::int AS count
           FROM generate_series($1::date, $2::date, interval '1 day') AS d(day)
           LEFT JOIN bookings b ON date_trunc('day', b.created_at) = d.day ${bookingSeriesFilter}
          GROUP BY d.day ORDER BY d.day`,
        bookingSeriesParams,
      )
      .then((r) => r.rows);

    const revenueSeriesParams = [from, to];
    const revenueSeriesFilter = hotelIdFilter('b.hotel_id', hotelArray, revenueSeriesParams);
    const revenueSeries = await pool
      .query(
        `SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
                COALESCE(SUM(p.amount_minor), 0)::bigint AS collected_minor
           FROM generate_series($1::date, $2::date, interval '1 day') AS d(day)
           LEFT JOIN payments p ON date_trunc('day', p.paid_at) = d.day AND p.status = 'SUCCESS'
           LEFT JOIN bookings b ON b.id = p.booking_id ${revenueSeriesFilter}
          GROUP BY d.day ORDER BY d.day`,
        revenueSeriesParams,
      )
      .then((r) => r.rows);

    const statusParams = [from, to];
    const statusFilter = hotelIdFilter('hotel_id', hotelArray, statusParams);
    const statusBreakdown = await pool
      .query(
        `SELECT status, COUNT(*)::int AS count FROM bookings
          WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day') ${statusFilter}
          GROUP BY status`,
        statusParams,
      )
      .then((r) => Object.fromEntries(r.rows.map((row) => [row.status, row.count])));

    const revenueParams = [from, to];
    const revenueFilter = hotelIdFilter('b.hotel_id', hotelArray, revenueParams);
    const revenueTotals = await pool
      .query(
        `SELECT
           COALESCE((SELECT SUM(total_minor) FROM bookings b WHERE b.status NOT IN ('INITIATED', 'FAILED')
              AND b.created_at >= $1::date AND b.created_at < ($2::date + interval '1 day') ${revenueFilter}), 0)::bigint AS gross_minor,
           COALESCE((SELECT SUM(p.amount_minor) FROM payments p JOIN bookings b ON b.id = p.booking_id
              WHERE p.status = 'SUCCESS' AND p.paid_at >= $1::date AND p.paid_at < ($2::date + interval '1 day') ${revenueFilter}), 0)::bigint AS collected_minor,
           COALESCE((SELECT SUM(r.amount_minor) FROM refunds r JOIN bookings b ON b.id = r.booking_id
              WHERE r.status = 'SUCCESS' AND r.processed_at >= $1::date AND r.processed_at < ($2::date + interval '1 day') ${revenueFilter}), 0)::bigint AS refunded_minor`,
        revenueParams,
      )
      .then((r) => r.rows[0]);

    const topParams = [from, to];
    const topFilter = hotelIdFilter('b.hotel_id', hotelArray, topParams);
    const topHotels = await pool
      .query(
        `SELECT h.id, h.name, h.city, COUNT(b.id)::int AS bookings, COALESCE(SUM(b.total_minor), 0)::bigint AS revenue_minor
           FROM bookings b
           JOIN hotels h ON h.id = b.hotel_id
          WHERE b.status NOT IN ('INITIATED', 'FAILED')
            AND b.created_at >= $1::date AND b.created_at < ($2::date + interval '1 day') ${topFilter}
          GROUP BY h.id, h.name, h.city
          ORDER BY revenue_minor DESC
          LIMIT 5`,
        topParams,
      )
      .then((r) => r.rows);

    return {
      range: { from, to },
      bookingSeries: bookingSeries.map((row) => ({ date: row.date, count: row.count })),
      revenueSeries: revenueSeries.map((row) => ({ date: row.date, collectedMinor: Number(row.collected_minor) })),
      statusBreakdown,
      revenue: {
        grossMinor: Number(revenueTotals.gross_minor),
        collectedMinor: Number(revenueTotals.collected_minor),
        refundedMinor: Number(revenueTotals.refunded_minor),
        netMinor: Number(revenueTotals.collected_minor) - Number(revenueTotals.refunded_minor),
        currency: 'INR',
      },
      topHotels: topHotels.map((row) => ({ id: row.id, name: row.name, city: row.city, bookings: row.bookings, revenueMinor: Number(row.revenue_minor) })),
    };
  },
};
