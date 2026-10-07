import { pool } from '../db/pool.js';

const COLUMNS = `id, user_id, type, title, message, entity_type, entity_id, read_at, created_at`;

export const notificationRepository = {
  async insert(client, { userId, type, title, message, entityType = null, entityId = null }) {
    const { rows } = await client.query(
      `INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNS}`,
      [userId, type, title, message, entityType, entityId],
    );
    return rows[0];
  },

  async listForUser(userId, { page, limit }) {
    const { rows } = await pool.query(
      `SELECT ${COLUMNS}, COUNT(*) OVER()::int AS total_count
         FROM notifications WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [userId, limit, (page - 1) * limit],
    );
    return { rows, total: rows[0]?.total_count ?? 0 };
  },

  async unreadCount(userId) {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [userId]);
    return rows[0].n;
  },

  /**
   * Scoped by user_id in the WHERE clause itself -- another user's notification simply matches no row,
   * so there is no separate ownership check to get wrong. Idempotent: marking an already-read one again
   * still returns it (COALESCE keeps the original read_at), only a truly missing/foreign id returns null.
   */
  async markRead(userId, id) {
    const { rows } = await pool.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2 RETURNING ${COLUMNS}`,
      [id, userId],
    );
    return rows[0] ?? null;
  },

  async markAllRead(userId) {
    const { rowCount } = await pool.query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [userId]);
    return rowCount;
  },
};
