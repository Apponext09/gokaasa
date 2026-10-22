import { pool } from '../db/pool.js';

const PLATFORMS = ['web', 'android', 'ios'];

/** Session rows for presence/activity tracking. Never selects or accepts anything token-shaped. */
export const presenceRepository = {
  async startSession(userId, { platform = 'web', browser, os, route, routeLabel }) {
    const safePlatform = PLATFORMS.includes(platform) ? platform : 'web';
    const { rows } = await pool.query(
      `INSERT INTO user_sessions (user_id, platform, browser, os, current_route, current_route_label)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, started_at, last_heartbeat_at`,
      [userId, safePlatform, browser ?? null, os ?? null, route ?? null, routeLabel ?? null],
    );
    return rows[0];
  },

  async heartbeat(sessionId, userId, { route, routeLabel } = {}) {
    const { rows } = await pool.query(
      `UPDATE user_sessions
          SET last_heartbeat_at = now(),
              updated_at = now(),
              current_route = COALESCE($3, current_route),
              current_route_label = COALESCE($4, current_route_label)
        WHERE id = $1 AND user_id = $2 AND ended_at IS NULL
        RETURNING id, last_heartbeat_at, current_route, current_route_label`,
      [sessionId, userId, route ?? null, routeLabel ?? null],
    );
    return rows[0] ?? null;
  },

  /** Ends a session. `userId` is always required (the owner for self-service, an admin-verified target otherwise) -- a session can never be ended on another user's say-so. An optional transaction client lets the admin path keep this atomic with its audit-log write. */
  async endSession(sessionId, userId, client = pool) {
    const { rowCount } = await client.query(
      `UPDATE user_sessions SET ended_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2 AND ended_at IS NULL`,
      [sessionId, userId],
    );
    return rowCount > 0;
  },

  async endAllForUser(client, userId) {
    await client.query(
      `UPDATE user_sessions SET ended_at = now(), updated_at = now() WHERE user_id = $1 AND ended_at IS NULL`,
      [userId],
    );
  },

  async listSessionsForUser(userId, { limit = 20 } = {}) {
    const { rows } = await pool.query(
      `SELECT id, platform, browser, os, current_route, current_route_label, started_at, last_heartbeat_at, ended_at
         FROM user_sessions WHERE user_id = $1 ORDER BY started_at DESC LIMIT $2`,
      [userId, limit],
    );
    return rows;
  },

  /** Closes sessions that stopped heartbeating a while ago. Online/offline itself never depends on this -- it only bounds how long a dead session lingers as "active" in the admin view. */
  async cleanupStale(expireMinutes) {
    const { rowCount } = await pool.query(
      `UPDATE user_sessions SET ended_at = now(), updated_at = now()
        WHERE ended_at IS NULL AND last_heartbeat_at < now() - ($1::text || ' minutes')::interval`,
      [expireMinutes],
    );
    return rowCount;
  },

  /**
   * Paginated admin directory across every role, each row carrying its most recent still-open session
   * (if any) via a LATERAL join -- one query, no N+1. Role filtering happens before aggregation via
   * EXISTS, since a user can hold more than one role.
   */
  async adminList({ q, role, status, online, from, to, lastActivityFrom, lastActivityTo, sort, page, limit }, onlineTimeoutSeconds) {
    const params = [];
    const param = (value) => {
      params.push(value);
      return `$${params.length}`;
    };
    const clauses = [`u.deleted_at IS NULL`, `u.is_guest IS NOT TRUE`];

    if (q) {
      const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      clauses.push(
        `(u.email ILIKE ${param(pattern)} OR u.first_name ILIKE ${param(pattern)} OR u.last_name ILIKE ${param(pattern)} OR u.phone ILIKE ${param(pattern)} OR u.id::text = ${param(q)})`,
      );
    }
    if (role) {
      clauses.push(`EXISTS (SELECT 1 FROM user_roles ur2 JOIN roles r2 ON r2.id = ur2.role_id WHERE ur2.user_id = u.id AND r2.code = ${param(role)})`);
    }
    if (status === 'active') clauses.push('u.is_active IS TRUE');
    if (status === 'inactive') clauses.push('u.is_active IS FALSE');
    if (from) clauses.push(`u.created_at >= ${param(from)}`);
    if (to) clauses.push(`u.created_at < ${param(to)}`);

    // The timeout param is only bound when actually referenced in the query text below -- binding it
    // unconditionally makes Postgres unable to infer its type ("could not determine data type of
    // parameter") whenever neither online/offline filter is applied.
    if (online === 'online' || online === 'offline') {
      const onlineExpr = `s.last_heartbeat_at IS NOT NULL AND s.last_heartbeat_at > now() - (${param(onlineTimeoutSeconds)}::text || ' seconds')::interval`;
      clauses.push(online === 'online' ? `(${onlineExpr})` : `NOT (${onlineExpr})`);
    }

    if (lastActivityFrom) clauses.push(`s.last_heartbeat_at >= ${param(lastActivityFrom)}`);
    if (lastActivityTo) clauses.push(`s.last_heartbeat_at < ${param(lastActivityTo)}`);

    const sortMap = {
      created_desc: 'u.created_at DESC',
      created_asc: 'u.created_at ASC',
      last_activity_desc: 's.last_heartbeat_at DESC NULLS LAST',
      name_asc: 'u.first_name ASC, u.last_name ASC',
    };
    const orderBy = sortMap[sort] ?? sortMap.created_desc;

    params.push(limit, (page - 1) * limit);
    const { rows } = await pool.query(
      `SELECT u.id, u.email::text AS email, u.first_name, u.last_name, u.phone, u.is_active, u.created_at, u.last_login_at,
              roles.codes AS role_codes,
              s.id AS session_id, s.platform, s.browser, s.os, s.current_route, s.current_route_label,
              s.started_at AS session_started_at, s.last_heartbeat_at,
              COUNT(*) OVER()::int AS total_count
         FROM users u
         CROSS JOIN LATERAL (
           SELECT array_agg(r.code ORDER BY r.code) AS codes
             FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id
         ) roles
         LEFT JOIN LATERAL (
           SELECT id, platform, browser, os, current_route, current_route_label, started_at, last_heartbeat_at
             FROM user_sessions WHERE user_id = u.id AND ended_at IS NULL ORDER BY last_heartbeat_at DESC LIMIT 1
         ) s ON true
        WHERE ${clauses.join(' AND ')}
        ORDER BY ${orderBy}
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: rows[0]?.total_count ?? 0 };
  },

  async adminFindById(userId) {
    const { rows } = await pool.query(
      `SELECT u.id, u.email::text AS email, u.first_name, u.last_name, u.phone, u.is_active, u.created_at, u.last_login_at,
              roles.codes AS role_codes
         FROM users u
         CROSS JOIN LATERAL (
           SELECT array_agg(r.code ORDER BY r.code) AS codes
             FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id
         ) roles
        WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId],
    );
    return rows[0] ?? null;
  },

  /** Platform-wide counts for the KPI row. `eligibleSince` scopes "new today" to the configured business day. */
  async kpis({ onlineTimeoutSeconds, eligibleSince }) {
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND is_guest IS NOT TRUE) AS total_users,
         (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND is_guest IS NOT TRUE AND created_at >= $2) AS new_users_today,
         (SELECT COUNT(DISTINCT s.user_id) FROM user_sessions s JOIN users u ON u.id = s.user_id
            WHERE u.deleted_at IS NULL AND u.is_guest IS NOT TRUE AND s.ended_at IS NULL
              AND s.last_heartbeat_at > now() - ($1::text || ' seconds')::interval) AS online_now,
         (SELECT COUNT(*) FROM user_sessions s JOIN users u ON u.id = s.user_id
            WHERE u.deleted_at IS NULL AND u.is_guest IS NOT TRUE AND s.ended_at IS NULL
              AND s.last_heartbeat_at > now() - ($1::text || ' seconds')::interval) AS active_sessions
      `,
      [onlineTimeoutSeconds, eligibleSince],
    );
    const row = rows[0];
    const totalUsers = Number(row.total_users);
    const onlineNow = Number(row.online_now);
    return {
      totalUsers,
      onlineNow,
      offlineUsers: Math.max(0, totalUsers - onlineNow),
      newUsersToday: Number(row.new_users_today),
      activeSessions: Number(row.active_sessions),
    };
  },
};
