import bcrypt from 'bcryptjs';
import { config } from '../src/config/index.js';

/**
 * Creates the first administrator from ADMIN_EMAIL / ADMIN_PASSWORD. Skipped when they are not set,
 * so no default credentials ever exist.
 */
export async function seedAdminUser(client) {
  const { adminEmail, adminPassword } = config.seed;
  if (!adminEmail || !adminPassword) return 'skipped (ADMIN_EMAIL / ADMIN_PASSWORD not set)';
  if (adminPassword.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');

  const email = adminEmail.trim().toLowerCase();
  const existing = await client.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rowCount > 0) {
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE code = 'ADMIN'
       ON CONFLICT DO NOTHING`,
      [existing.rows[0].id],
    );
    return `${email} already exists; ADMIN role ensured`;
  }

  const passwordHash = await bcrypt.hash(adminPassword, config.auth.bcryptRounds);
  const { rows } = await client.query(
    `INSERT INTO users (email, password_hash, first_name, last_name)
     VALUES ($1, $2, 'Platform', 'Admin') RETURNING id`,
    [email, passwordHash],
  );
  await client.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code = 'ADMIN'`, [
    rows[0].id,
  ]);
  return `created ${email}`;
}
