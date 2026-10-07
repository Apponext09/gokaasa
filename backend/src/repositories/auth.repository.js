export const authRepository = {
  async insertRefreshToken(client, { userId, tokenHash, expiresAt, userAgent, ipAddress }) {
    const { rows } = await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, tokenHash, expiresAt, userAgent ?? null, ipAddress ?? null],
    );
    return rows[0].id;
  },

  async findRefreshTokenForUpdate(client, tokenHash) {
    const { rows } = await client.query(
      `SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
      [tokenHash],
    );
    return rows[0] ?? null;
  },

  async revokeRefreshToken(client, id, replacedBy = null) {
    await client.query(
      `UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1 AND revoked_at IS NULL`,
      [id, replacedBy],
    );
  },

  async revokeAllForUser(client, userId) {
    await client.query(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
  },

  async invalidateResetTokens(client, userId) {
    await client.query(
      `UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    );
  },

  async insertResetToken(client, { userId, tokenHash, expiresAt }) {
    await client.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt],
    );
  },

  async findResetTokenForUpdate(client, tokenHash) {
    const { rows } = await client.query(
      `SELECT id, user_id, expires_at, used_at
         FROM password_reset_tokens
        WHERE token_hash = $1
        FOR UPDATE`,
      [tokenHash],
    );
    return rows[0] ?? null;
  },

  async markResetTokenUsed(client, id) {
    await client.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [id]);
  },
};
