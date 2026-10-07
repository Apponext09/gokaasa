import { pool } from '../db/pool.js';

/** Never selects password_hash or any token — only what an admin list/detail view needs. */
export const adminCustomerRepository = {
  async list({ q, page, limit }, hotelIds) {
    const params = [];
    const param = (value) => {
      params.push(value);
      return `$${params.length}`;
    };
    const clauses = [`r.code = 'CUSTOMER'`, `u.deleted_at IS NULL`];
    if (q) {
      const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      clauses.push(`(u.email ILIKE ${param(pattern)} OR u.first_name ILIKE ${param(pattern)} OR u.last_name ILIKE ${param(pattern)} OR u.phone ILIKE ${param(pattern)})`);
    }
    const bookingJoin = hotelIds == null
      ? `LEFT JOIN bookings b ON b.user_id = u.id`
      : `JOIN bookings b ON b.user_id = u.id AND b.hotel_id = ANY(${param(hotelIds)}::bigint[])`;

    params.push(limit, (page - 1) * limit);
    const { rows } = await pool.query(
      `SELECT u.id, u.email::text AS email, u.first_name, u.last_name, u.phone, u.created_at,
              COUNT(b.id)::int AS bookings_count,
              COALESCE(SUM(b.paid_minor), 0)::bigint AS total_spend_minor,
              MAX(b.created_at) AS last_booking_at,
              COUNT(*) OVER()::int AS total_count
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
         ${bookingJoin}
        WHERE ${clauses.join(' AND ')}
        GROUP BY u.id
        ORDER BY last_booking_at DESC NULLS LAST, u.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: rows[0]?.total_count ?? 0 };
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT u.id, u.email::text AS email, u.first_name, u.last_name, u.phone, u.created_at, u.is_active
         FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
        WHERE u.id = $1 AND r.code = 'CUSTOMER' AND u.deleted_at IS NULL`,
      [id],
    );
    return rows[0] ?? null;
  },

  /** True when this customer has at least one booking at one of the given hotels. Used to scope a manager's view. */
  async hasBookingAtHotels(customerId, hotelIds) {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM bookings WHERE user_id = $1 AND hotel_id = ANY($2::bigint[]) LIMIT 1`,
      [customerId, hotelIds],
    );
    return rowCount > 0;
  },
};
