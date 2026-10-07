import { pool } from '../db/pool.js';

export const auditRepository = {
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
