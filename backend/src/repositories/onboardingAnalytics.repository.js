import { pool } from '../db/pool.js';

/**
 * Resolves every hotel-editing audit row back to the hotel it actually belongs to. Room-type and
 * rate-plan edits are logged under their own `entity` (see hotel.service.js/roomType.service.js/
 * ratePlan.service.js), keyed by the room-type/rate-plan id, not the hotel id -- this union is what lets
 * "hotels edited" / "editing activity" be counted correctly instead of only counting entity='hotel' rows.
 */
const HOTEL_ACTIVITY_CTE = `
  hotel_activity AS (
    SELECT a.id, a.user_id, a.action, a.created_at, h2.id AS hotel_id
      FROM audit_logs a JOIN hotels h2 ON h2.id::text = a.entity_id WHERE a.entity = 'hotel'
    UNION ALL
    SELECT a.id, a.user_id, a.action, a.created_at, rt.hotel_id
      FROM audit_logs a JOIN room_types rt ON rt.id::text = a.entity_id WHERE a.entity = 'room_type'
    UNION ALL
    SELECT a.id, a.user_id, a.action, a.created_at, rp.hotel_id
      FROM audit_logs a JOIN rate_plans rp ON rp.id::text = a.entity_id WHERE a.entity = 'rate_plan'
  )
`;

/**
 * Builds `column >= from AND column < (to + 1 day)` clauses, pushing params onto the given array and
 * returning the SQL fragment (or '' if neither bound is given). The exclusive upper bound is the whole
 * point: `column <= to` silently drops everything on the `to` day after midnight, which is the kind of
 * off-by-one that made this module's listing/detail counts disagree. Every date-range query in this file
 * uses this one helper so "the same range" always means the same two boundaries everywhere it's applied.
 */
function dateRangeClause(column, params, { from, to }) {
  const clauses = [];
  if (from) clauses.push(`${column} >= $${params.push(from)}::date`);
  if (to) clauses.push(`${column} < ($${params.push(to)}::date + interval '1 day')`);
  return clauses.length ? `AND ${clauses.join(' AND ')}` : '';
}

const SORT_OPTIONS = {
  onboarded_desc: 'onboarded DESC NULLS LAST, total_modifications DESC NULLS LAST',
  edited_desc: 'total_modifications DESC NULLS LAST, onboarded DESC NULLS LAST',
  name_asc: 'u.first_name ASC, u.last_name ASC',
};

export const onboardingAnalyticsRepository = {
  /** KPI cards for the Overview Dashboard, computed from real rows -- no mock data. */
  async overview() {
    const [totals, activeExecutives, hotelsEdited] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS total_hotels,
          COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))::int AS onboarded_this_month,
          COUNT(*) FILTER (WHERE created_at >= date_trunc('week', now()))::int AS onboarded_this_week,
          COUNT(*) FILTER (WHERE status = 'PENDING_REVIEW')::int AS pending_review,
          COUNT(*) FILTER (WHERE status IN ('READY_TO_PUBLISH', 'PUBLISHED'))::int AS approved,
          COUNT(*) FILTER (WHERE status = 'CHANGES_REQUESTED')::int AS changes_requested
        FROM hotels WHERE deleted_at IS NULL
      `),
      pool.query(`
        SELECT COUNT(DISTINCT u.id)::int AS count
          FROM users u
          JOIN user_roles ur ON ur.user_id = u.id
          JOIN roles r ON r.id = ur.role_id
         WHERE r.code = 'HOTEL_ONBOARDING_EXECUTIVE' AND u.is_active AND u.deleted_at IS NULL
      `),
      pool.query(`
        WITH ${HOTEL_ACTIVITY_CTE}
        SELECT COUNT(DISTINCT hotel_id)::int AS count FROM hotel_activity WHERE action <> 'hotel.created'
      `),
    ]);
    return {
      ...totals.rows[0],
      active_onboarding_executives: activeExecutives.rows[0].count,
      total_hotels_edited: hotelsEdited.rows[0].count,
    };
  },

  /** Month-bucketed onboarding counts, zero-filled for months with no hotels -- same generate_series idiom as dashboard.service.js's day-bucketed trends. */
  async monthlyTrends(months) {
    const { rows } = await pool.query(
      `SELECT to_char(d.month, 'YYYY-MM') AS month, COUNT(h.id)::int AS count
         FROM generate_series(date_trunc('month', now()) - ($1::text || ' months')::interval, date_trunc('month', now()), interval '1 month') AS d(month)
         LEFT JOIN hotels h ON date_trunc('month', h.created_at) = d.month AND h.deleted_at IS NULL
        GROUP BY d.month ORDER BY d.month`,
      [months - 1],
    );
    return rows;
  },

  /** Per-employee onboarding bar chart: hotels onboarded, split by current status. */
  async employeeWiseOnboarding() {
    const { rows } = await pool.query(`
      SELECT u.id, (u.first_name || ' ' || u.last_name) AS name,
             COUNT(h.id)::int AS onboarded,
             COUNT(h.id) FILTER (WHERE h.status IN ('READY_TO_PUBLISH', 'PUBLISHED'))::int AS approved,
             COUNT(h.id) FILTER (WHERE h.status = 'PENDING_REVIEW')::int AS pending,
             COUNT(h.id) FILTER (WHERE h.status = 'CHANGES_REQUESTED')::int AS changes_requested
        FROM hotels h JOIN users u ON u.id = h.created_by
       WHERE h.deleted_at IS NULL
       GROUP BY u.id, name
       ORDER BY onboarded DESC
       LIMIT 20
    `);
    return rows;
  },

  /** Per-employee editing bar chart: total modification activities vs. unique hotels touched. */
  async employeeWiseEditing() {
    const { rows } = await pool.query(`
      WITH ${HOTEL_ACTIVITY_CTE}
      SELECT u.id, (u.first_name || ' ' || u.last_name) AS name,
             COUNT(*)::int AS total_modifications,
             COUNT(DISTINCT ha.hotel_id)::int AS unique_hotels_edited
        FROM hotel_activity ha JOIN users u ON u.id = ha.user_id
       WHERE ha.action <> 'hotel.created'
       GROUP BY u.id, name
       ORDER BY total_modifications DESC
       LIMIT 20
    `);
    return rows;
  },

  /**
   * One row per staff user who has onboarded or edited at least one hotel, in `{ from, to }` (optional).
   * Uses the exact same two CTEs, the same status buckets, and the same dateRangeClause boundaries as
   * employeeStats below, so a row here and that same employee's detail page agree for the same range --
   * this is the one place both "onboarded" and "edited" are computed for the listing, so there is nowhere
   * else for the two pages' numbers to drift apart.
   */
  async employeePerformanceList({ q, page, limit, sort, from, to }) {
    const params = [];
    const param = (value) => {
      params.push(value);
      return `$${params.length}`;
    };
    const onboardedDateSql = dateRangeClause('created_at', params, { from, to });
    const editedDateSql = dateRangeClause('created_at', params, { from, to });

    const clauses = ['u.deleted_at IS NULL', '(o.user_id IS NOT NULL OR e.user_id IS NOT NULL)'];
    if (q) {
      const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      clauses.push(`(u.first_name ILIKE ${param(pattern)} OR u.last_name ILIKE ${param(pattern)} OR u.email ILIKE ${param(pattern)})`);
    }
    const orderBy = SORT_OPTIONS[sort] ?? SORT_OPTIONS.onboarded_desc;
    params.push(limit, (page - 1) * limit);

    const { rows } = await pool.query(
      `WITH onboarded AS (
         SELECT created_by AS user_id,
                COUNT(*)::int AS onboarded,
                COUNT(*) FILTER (WHERE status IN ('READY_TO_PUBLISH', 'PUBLISHED'))::int AS approved,
                COUNT(*) FILTER (WHERE status = 'PENDING_REVIEW')::int AS pending,
                COUNT(*) FILTER (WHERE status = 'CHANGES_REQUESTED')::int AS changes_requested,
                MAX(created_at) AS last_onboarded_at
           FROM hotels WHERE deleted_at IS NULL AND created_by IS NOT NULL ${onboardedDateSql}
          GROUP BY created_by
       ),
       ${HOTEL_ACTIVITY_CTE},
       edited AS (
         SELECT user_id,
                COUNT(*)::int AS total_modifications,
                COUNT(DISTINCT hotel_id)::int AS hotels_edited,
                MAX(created_at) AS last_edited_at
           FROM hotel_activity WHERE action <> 'hotel.created' AND user_id IS NOT NULL ${editedDateSql}
          GROUP BY user_id
       )
       SELECT u.id, u.first_name, u.last_name, u.email::text AS email, u.phone,
              ARRAY(SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles,
              COALESCE(o.onboarded, 0) AS onboarded, COALESCE(o.approved, 0) AS approved,
              COALESCE(o.pending, 0) AS pending, COALESCE(o.changes_requested, 0) AS changes_requested,
              COALESCE(e.total_modifications, 0) AS total_modifications, COALESCE(e.hotels_edited, 0) AS hotels_edited,
              GREATEST(o.last_onboarded_at, e.last_edited_at) AS last_activity_at,
              COUNT(*) OVER()::int AS total_count
         FROM users u
         LEFT JOIN onboarded o ON o.user_id = u.id
         LEFT JOIN edited e ON e.user_id = u.id
        WHERE ${clauses.join(' AND ')}
        ORDER BY ${orderBy}, u.id ASC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: rows[0]?.total_count ?? 0 };
  },

  async hotelNamesByIds(ids) {
    if (ids.length === 0) return [];
    const { rows } = await pool.query(`SELECT id, name FROM hotels WHERE id = ANY($1::bigint[])`, [ids]);
    return rows;
  },

  async employeeProfile(userId) {
    const { rows } = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email::text AS email, u.phone, u.is_active, u.created_at,
              ARRAY(SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles
         FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId],
    );
    return rows[0] ?? null;
  },

  /**
   * Same status buckets, same `hotel_activity` CTE, and the same dateRangeClause boundaries as
   * employeePerformanceList above -- scoped to one user instead of grouped across everyone, so a given
   * employee's numbers here are identical to their row in that listing for the same `{ from, to }`.
   */
  async employeeStats(userId, { from, to } = {}) {
    const onboardedParams = [userId];
    const onboardedDateSql = dateRangeClause('created_at', onboardedParams, { from, to });

    const editedParams = [userId];
    const editedDateSql = dateRangeClause('created_at', editedParams, { from, to });

    const [onboarded, edited] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS onboarded,
                COUNT(*) FILTER (WHERE status IN ('READY_TO_PUBLISH', 'PUBLISHED'))::int AS approved,
                COUNT(*) FILTER (WHERE status = 'PENDING_REVIEW')::int AS pending,
                COUNT(*) FILTER (WHERE status = 'CHANGES_REQUESTED')::int AS changes_requested
           FROM hotels
          WHERE deleted_at IS NULL AND created_by = $1 ${onboardedDateSql}`,
        onboardedParams,
      ),
      pool.query(
        `WITH ${HOTEL_ACTIVITY_CTE}
         SELECT COUNT(*)::int AS total_modifications, COUNT(DISTINCT hotel_id)::int AS hotels_edited
           FROM hotel_activity
          WHERE user_id = $1 AND action <> 'hotel.created' ${editedDateSql}`,
        editedParams,
      ),
    ]);
    return { ...onboarded.rows[0], ...edited.rows[0] };
  },

  /** Month-bucketed onboarding counts for one employee -- same bucketing as the platform-wide trend. */
  async employeeMonthlyOnboarding(userId, months) {
    const { rows } = await pool.query(
      `SELECT to_char(d.month, 'YYYY-MM') AS month, COUNT(h.id)::int AS count
         FROM generate_series(date_trunc('month', now()) - ($2::text || ' months')::interval, date_trunc('month', now()), interval '1 month') AS d(month)
         LEFT JOIN hotels h ON date_trunc('month', h.created_at) = d.month AND h.deleted_at IS NULL AND h.created_by = $1
        GROUP BY d.month ORDER BY d.month`,
      [userId, months - 1],
    );
    return rows;
  },
};
