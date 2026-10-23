import { pool } from '../db/pool.js';

function toCommission(row) {
  if (!row) return null;
  return {
    id: row.id,
    bookingId: row.booking_id,
    hotelId: row.hotel_id,
    paymentId: row.payment_id,
    currency: row.currency,
    eligibleAccommodationMinor: Number(row.eligible_accommodation_minor),
    commissionRateApplied: Number(row.commission_rate_applied),
    commissionMinor: Number(row.commission_minor),
    hotelEarningsMinor: Number(row.hotel_earnings_minor),
    platformDiscountCostMinor: Number(row.platform_discount_cost_minor),
    status: row.status,
    createdAt: row.created_at,
    reversedAt: row.reversed_at,
  };
}

export const bookingCommissionRepository = {
  async findByBookingId(bookingId, client = pool) {
    const { rows } = await client.query(`SELECT * FROM booking_commissions WHERE booking_id = $1`, [bookingId]);
    return toCommission(rows[0]);
  },

  async insert(client, {
    bookingId, hotelId, paymentId, currency, eligibleAccommodationMinor,
    commissionRateApplied, commissionMinor, hotelEarningsMinor, platformDiscountCostMinor,
  }) {
    const { rows } = await client.query(
      `INSERT INTO booking_commissions
         (booking_id, hotel_id, payment_id, currency, eligible_accommodation_minor,
          commission_rate_applied, commission_minor, hotel_earnings_minor, platform_discount_cost_minor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (booking_id) DO NOTHING
       RETURNING id`,
      [bookingId, hotelId, paymentId, currency, eligibleAccommodationMinor,
        commissionRateApplied, commissionMinor, hotelEarningsMinor, platformDiscountCostMinor],
    );
    return rows[0]?.id ?? null;
  },

  async markReversed(client, id) {
    await client.query(`UPDATE booking_commissions SET status = 'REVERSED', reversed_at = now() WHERE id = $1`, [id]);
  },

  async listForHotels(hotelIds, { page, limit, status }, client = pool) {
    const params = [];
    let where = '1=1';
    if (hotelIds != null) {
      params.push(hotelIds);
      where += ` AND hotel_id = ANY($${params.length}::bigint[])`;
    }
    if (status) {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }
    params.push(limit, (page - 1) * limit);
    const { rows } = await client.query(
      `SELECT *, COUNT(*) OVER()::int AS total_count FROM booking_commissions
        WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { total: rows[0]?.total_count ?? 0, rows: rows.map(toCommission) };
  },
};
