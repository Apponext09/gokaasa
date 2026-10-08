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
    if (entity) clauses.push(`a.entity = ${param(entity)}`);
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
