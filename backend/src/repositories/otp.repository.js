export const otpRepository = {
  async invalidateActive(client, userId, purpose) {
    await client.query(
      `UPDATE otp_codes SET consumed_at = now() WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
      [userId, purpose],
    );
  },

  async insert(client, { userId, purpose, codeHash, expiresAt }) {
    await client.query(
      `INSERT INTO otp_codes (user_id, purpose, code_hash, expires_at) VALUES ($1, $2, $3, $4)`,
      [userId, purpose, codeHash, expiresAt],
    );
  },

  /** Locks the active code row for this user/purpose so a verify can safely read-then-write attempts. */
  async findActiveForUpdate(client, userId, purpose) {
    const { rows } = await client.query(
      `SELECT * FROM otp_codes WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [userId, purpose],
    );
    return rows[0] ?? null;
  },

  async incrementAttempts(client, id) {
    await client.query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [id]);
  },

  async markConsumed(client, id) {
    await client.query(`UPDATE otp_codes SET consumed_at = now() WHERE id = $1`, [id]);
  },
};
