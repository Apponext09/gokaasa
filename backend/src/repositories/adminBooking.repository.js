import { pool } from '../db/pool.js';

const SORT = {
  created_desc: 'b.created_at DESC',
  created_asc: 'b.created_at ASC',
  check_in_asc: 'b.check_in ASC',
  amount_desc: 'b.total_minor DESC',
};

function hotelScope(hotelIds, params, column = 'b.hotel_id') {
  if (hotelIds == null) return '';
  params.push(hotelIds);
  return `AND ${column} = ANY($${params.length}::bigint[])`;
}

export const adminBookingRepository = {
  /** Every booking across every customer, optionally scoped to a HOTEL_MANAGER's assigned hotels. */
  async list(filters, hotelIds) {
    const params = [];
    const clauses = [];
    const param = (value) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (filters.q) {
      const pattern = `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      clauses.push(`(b.booking_ref ILIKE ${param(pattern)} OR b.primary_email ILIKE ${param(pattern)} OR b.primary_first_name ILIKE ${param(pattern)} OR b.primary_last_name ILIKE ${param(pattern)})`);
    }
    if (filters.hotelId) clauses.push(`b.hotel_id = ${param(filters.hotelId)}`);
    if (filters.customerId) clauses.push(`b.user_id = ${param(filters.customerId)}`);
    if (filters.status) clauses.push(`b.status = ${param(filters.status)}`);
    if (filters.from) clauses.push(`b.created_at >= ${param(filters.from)}::date`);
    if (filters.to) clauses.push(`b.created_at < (${param(filters.to)}::date + interval '1 day')`);
    let paymentJoin = '';
    if (filters.paymentStatus) {
      paymentJoin = `JOIN LATERAL (SELECT status FROM payments p WHERE p.booking_id = b.id ORDER BY p.attempt DESC LIMIT 1) latest_payment ON TRUE`;
      clauses.push(`latest_payment.status = ${param(filters.paymentStatus)}`);
    }
    clauses.push(hotelScope(hotelIds, params).replace(/^AND /, '') || 'TRUE');

    const where = clauses.join(' AND ');
    const orderBy = SORT[filters.sort] ?? SORT.created_desc;
    params.push(filters.limit, (filters.page - 1) * filters.limit);

    const { rows } = await pool.query(
      `SELECT b.id, b.booking_ref, b.status, b.hotel_id, b.hotel_name, b.hotel_city, b.check_in::text AS check_in,
              b.check_out::text AS check_out, b.rooms_count, b.total_minor, b.paid_minor, b.refunded_minor, b.currency,
              b.primary_first_name, b.primary_last_name, b.primary_email::text AS primary_email, b.created_at,
              (SELECT status FROM payments p WHERE p.booking_id = b.id ORDER BY p.attempt DESC LIMIT 1) AS payment_status,
              COUNT(*) OVER()::int AS total_count
         FROM bookings b
         ${paymentJoin}
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: rows[0]?.total_count ?? 0 };
  },

  async listPayments(filters, hotelIds) {
    const params = [];
    const clauses = [];
    const param = (value) => {
      params.push(value);
      return `$${params.length}`;
    };
    if (filters.status) clauses.push(`p.status = ${param(filters.status)}`);
    if (filters.hotelId) clauses.push(`b.hotel_id = ${param(filters.hotelId)}`);
    if (filters.customerId) clauses.push(`b.user_id = ${param(filters.customerId)}`);
    if (filters.from) clauses.push(`p.created_at >= ${param(filters.from)}::date`);
    if (filters.to) clauses.push(`p.created_at < (${param(filters.to)}::date + interval '1 day')`);
    clauses.push(hotelScope(hotelIds, params).replace(/^AND /, '') || 'TRUE');
    const where = clauses.join(' AND ');
    params.push(filters.limit, (filters.page - 1) * filters.limit);

    const { rows } = await pool.query(
      `SELECT p.id, p.booking_id, p.provider_order_id, p.provider_payment_id, p.amount_minor, p.currency, p.status,
              p.gateway_mode, p.created_at, p.paid_at, b.booking_ref, b.hotel_name,
              b.primary_first_name, b.primary_last_name, b.primary_email::text AS primary_email,
              COUNT(*) OVER()::int AS total_count
         FROM payments p JOIN bookings b ON b.id = p.booking_id
        WHERE ${where}
        ORDER BY p.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: rows[0]?.total_count ?? 0 };
  },

  async listRefunds(filters, hotelIds) {
    const params = [];
    const clauses = [];
    const param = (value) => {
      params.push(value);
      return `$${params.length}`;
    };
    if (filters.status) clauses.push(`r.status = ${param(filters.status)}`);
    if (filters.hotelId) clauses.push(`b.hotel_id = ${param(filters.hotelId)}`);
    if (filters.customerId) clauses.push(`b.user_id = ${param(filters.customerId)}`);
    if (filters.from) clauses.push(`r.created_at >= ${param(filters.from)}::date`);
    if (filters.to) clauses.push(`r.created_at < (${param(filters.to)}::date + interval '1 day')`);
    clauses.push(hotelScope(hotelIds, params).replace(/^AND /, '') || 'TRUE');
    const where = clauses.join(' AND ');
    params.push(filters.limit, (filters.page - 1) * filters.limit);

    const { rows } = await pool.query(
      `SELECT r.id, r.booking_id, r.payment_id, r.amount_minor, r.status, r.reason, r.provider_refund_id,
              r.created_at, r.processed_at, b.booking_ref, b.hotel_name,
              b.primary_first_name, b.primary_last_name, b.primary_email::text AS primary_email,
              COUNT(*) OVER()::int AS total_count
         FROM refunds r JOIN bookings b ON b.id = r.booking_id
        WHERE ${where}
        ORDER BY r.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: rows[0]?.total_count ?? 0 };
  },
};
