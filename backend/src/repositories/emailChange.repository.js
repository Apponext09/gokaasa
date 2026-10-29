import { pool } from '../db/pool.js';

export const emailChangeRepository = {
  async cancelActive(client, userId) {
    await client.query(
      `UPDATE email_change_requests
          SET cancelled_at = now(), updated_at = now()
        WHERE user_id = $1 AND consumed_at IS NULL AND cancelled_at IS NULL`,
      [userId],
    );
  },

  async create(client, { userId, newEmail, codeHash, expiresAt }) {
    const { rows } = await client.query(
      `INSERT INTO email_change_requests (user_id, new_email, code_hash, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, new_email::text AS new_email, expires_at, created_at`,
      [userId, newEmail, codeHash, expiresAt],
    );
    return rows[0];
  },

  async findActive(userId, client = pool) {
    const { rows } = await client.query(
      `SELECT id, user_id, new_email::text AS new_email, expires_at, attempts, created_at
         FROM email_change_requests
        WHERE user_id = $1 AND consumed_at IS NULL AND cancelled_at IS NULL
        ORDER BY id DESC LIMIT 1`,
      [userId],
    );
    return rows[0] ?? null;
  },

  async findActiveForUpdate(client, userId) {
    const { rows } = await client.query(
      `SELECT id, user_id, new_email::text AS new_email, code_hash, expires_at, attempts, created_at
         FROM email_change_requests
        WHERE user_id = $1 AND consumed_at IS NULL AND cancelled_at IS NULL
        ORDER BY id DESC LIMIT 1
        FOR UPDATE`,
      [userId],
    );
    return rows[0] ?? null;
  },

  async replaceCode(client, id, { codeHash, expiresAt }) {
    const { rows } = await client.query(
      `UPDATE email_change_requests
          SET code_hash = $2, expires_at = $3, attempts = 0, updated_at = now()
        WHERE id = $1
        RETURNING new_email::text AS new_email, expires_at`,
      [id, codeHash, expiresAt],
    );
    return rows[0];
  },

  async incrementAttempts(client, id) {
    await client.query(
      `UPDATE email_change_requests SET attempts = attempts + 1, updated_at = now() WHERE id = $1`,
      [id],
    );
  },

  async markConsumed(client, id) {
    await client.query(
      `UPDATE email_change_requests SET consumed_at = now(), updated_at = now() WHERE id = $1`,
      [id],
    );
  },
};
