import { pool } from '../db/pool.js';

const USER_COLUMNS = `
  u.id, u.email::text AS email, u.password_hash, u.first_name, u.last_name,
  u.phone, u.is_active, u.email_verified_at, u.created_at, u.is_guest
`;

function toUser(row, roles) {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    isActive: row.is_active,
    emailVerifiedAt: row.email_verified_at,
    createdAt: row.created_at,
    isGuest: row.is_guest,
    roles,
  };
}

async function loadUserWithRoles(rows, client = pool) {
  if (rows.length === 0) return null;
  const [row] = rows;
  const { rows: roleRows } = await client.query(
    `SELECT r.code
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
      ORDER BY r.code`,
    [row.id],
  );
  return toUser(
    row,
    roleRows.map((role) => role.code),
  );
}

export const userRepository = {
  async findByEmail(email, client = pool) {
    const { rows } = await client.query(
      `SELECT ${USER_COLUMNS} FROM users u WHERE u.email = $1 AND u.deleted_at IS NULL`,
      [email],
    );
    return loadUserWithRoles(rows, client);
  },

  async findById(id, client = pool) {
    const { rows } = await client.query(
      `SELECT ${USER_COLUMNS} FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [id],
    );
    return loadUserWithRoles(rows, client);
  },

  /** Inserts the user and grants a role, both inside the caller's transaction. */
  async create(client, { email, passwordHash, firstName, lastName, phone, roleCode, isGuest = false }) {
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, is_guest)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [email, passwordHash, firstName, lastName, phone ?? null, isGuest],
    );
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE code = $2`,
      [rows[0].id, roleCode],
    );
    return rows[0].id;
  },

  // The only caller is the email-verified "reset password" flow, so setting a real password here always
  // means this is now a genuinely verified account -- clears is_guest so a later guest-checkout call
  // for this email can never again bypass the password that was just set.
  async updatePassword(client, userId, passwordHash) {
    await client.query(
      `UPDATE users SET password_hash = $2, is_guest = FALSE, updated_at = now() WHERE id = $1`,
      [userId, passwordHash],
    );
  },

  /** Refreshes a guest's contact details for a new checkout, reusing their existing account rather than creating a duplicate. */
  async updateGuestContact(client, userId, { firstName, lastName, phone }) {
    await client.query(
      `UPDATE users SET first_name = $2, last_name = $3, phone = $4, updated_at = now() WHERE id = $1 AND is_guest`,
      [userId, firstName, lastName, phone ?? null],
    );
  },

  async touchLastLogin(userId) {
    await pool.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [userId]);
  },

  /** Partner self-service registration verifies the account's email via OTP before it can sign in with it. */
  async markEmailVerified(client, userId) {
    await client.query(`UPDATE users SET email_verified_at = now(), updated_at = now() WHERE id = $1`, [userId]);
  },
};
