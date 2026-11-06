import { pool } from '../db/pool.js';

export const auditRepository = {
  /** Newest first. ADMIN-only viewer — see auditLog.service.js. */
  async list({ page, limit, entity, action, entityId, actorId, q, from, to }) {
    const params = [];
    const clauses = [];
    const param = (value) => {
      params.push(value);
      return `$${params.length}`;
    };
    if (entity) {
      const entities = Array.isArray(entity) ? entity : [entity];
      clauses.push(`a.entity = ANY(${param(entities)}::text[])`);
    }
    if (action) clauses.push(`a.action = ${param(action)}`);
    if (entityId) clauses.push(`a.entity_id = ${param(String(entityId))}`);
    if (actorId) clauses.push(`a.user_id = ${param(actorId)}`);
    if (q) {
      const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      clauses.push(`(u.first_name ILIKE ${param(pattern)} OR u.last_name ILIKE ${param(pattern)} OR u.email ILIKE ${param(pattern)})`);
    }
    if (from) clauses.push(`a.created_at >= ${param(from)}::date`);
    if (to) clauses.push(`a.created_at < (${param(to)}::date + interval '1 day')`);
    const where = clauses.length > 0 ? clauses.join(' AND ') : 'TRUE';
    params.push(limit, (page - 1) * limit);

    const { rows } = await pool.query(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.old_value, a.new_value, a.ip_address, a.created_at,
              u.first_name, u.last_name, u.email::text AS email,
              -- The actor's CURRENT role(s), not a historical snapshot at the time of the action.
              ARRAY(SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = a.user_id) AS actor_roles,
              COUNT(*) OVER()::int AS total_count
         FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
        WHERE ${where}
        ORDER BY a.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: rows[0]?.total_count ?? 0 };
  },

  /**
   * A hotel's full activity timeline. `room_type`/`rate_plan` edits are logged under their own entity
   * (see hotel.service.js/roomType.service.js/ratePlan.service.js), not `entity='hotel'`, so this unions
   * all three, scoped back to this hotel, instead of missing room/rate edits entirely.
   */
  async listForHotel(hotelId, { page, limit }) {
    const { rows } = await pool.query(
      `WITH hotel_activity AS (
         SELECT a.* FROM audit_logs a WHERE a.entity = 'hotel' AND a.entity_id = $1::bigint::text
         UNION ALL
         SELECT a.* FROM audit_logs a
          WHERE a.entity = 'room_type' AND a.entity_id ~ '^\\d+$'
            AND a.entity_id::bigint IN (SELECT id FROM room_types WHERE hotel_id = $1::bigint)
         UNION ALL
         SELECT a.* FROM audit_logs a
          WHERE a.entity = 'rate_plan' AND a.entity_id ~ '^\\d+$'
            AND a.entity_id::bigint IN (SELECT id FROM rate_plans WHERE hotel_id = $1::bigint)
       )
       SELECT ha.id, ha.action, ha.entity, ha.entity_id, ha.old_value, ha.new_value, ha.ip_address, ha.created_at, ha.user_id,
              u.first_name, u.last_name, u.email::text AS email,
              ARRAY(SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ha.user_id) AS actor_roles,
              COUNT(*) OVER()::int AS total_count
         FROM hotel_activity ha LEFT JOIN users u ON u.id = ha.user_id
        ORDER BY ha.created_at DESC, ha.id DESC
        LIMIT $2 OFFSET $3`,
      [hotelId, limit, (page - 1) * limit],
    );
    return { rows, total: rows[0]?.total_count ?? 0 };
  },

  async insert(client, entry) {
    await (client ?? pool).query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, old_value, new_value, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.userId ?? null,
        entry.action,
        entry.entity,
        entry.entityId != null ? String(entry.entityId) : null,
        entry.oldValue ? JSON.stringify(entry.oldValue) : null,
        entry.newValue ? JSON.stringify(entry.newValue) : null,
        entry.ipAddress ?? null,
      ],
    );
  },
};
