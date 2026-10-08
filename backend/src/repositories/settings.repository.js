import { pool } from '../db/pool.js';

export const settingsRepository = {
  async getAll() {
    const { rows } = await pool.query(`SELECT key, value, updated_at FROM platform_settings`);
    return Object.fromEntries(rows.map((row) => [row.key, { value: row.value, updatedAt: row.updated_at }]));
  },

  /** Whitelisted at the service layer -- this just writes whatever keys it is given. */
  async setMany(client, entries, updatedBy) {
    for (const [key, value] of Object.entries(entries)) {
      await client.query(
        `INSERT INTO platform_settings (key, value, updated_by) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = now()`,
        [key, value, updatedBy],
      );
    }
  },
};
