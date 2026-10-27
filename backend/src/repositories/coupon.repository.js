import { pool } from '../db/pool.js';

const COUPON_COLUMNS = `
  c.id, c.code, c.discount_type, c.discount_value, c.max_discount_minor, c.min_amount_minor,
  c.valid_from, c.valid_to, c.usage_limit, c.used_count, c.is_active, c.per_user_limit, c.min_nights,
  c.customer_eligibility, c.stay_from::text AS stay_from, c.stay_to::text AS stay_to, c.description,
  c.image_storage_key, c.created_by, c.created_at, c.updated_at
`;

export const couponRepository = {
  async findByCode(code, client = pool) {
    const { rows } = await client.query(`SELECT ${COUPON_COLUMNS} FROM coupons c WHERE c.code = $1`, [code]);
    return rows[0] ?? null;
  },

  /** Row-locked read, used inside the apply/requote transaction so concurrent applies serialize. */
  async lockByCode(code, client) {
    const { rows } = await client.query(`SELECT ${COUPON_COLUMNS} FROM coupons c WHERE c.code = $1 FOR UPDATE`, [code]);
    return rows[0] ?? null;
  },

  async lockById(id, client) {
    const { rows } = await client.query(`SELECT ${COUPON_COLUMNS} FROM coupons c WHERE c.id = $1 FOR UPDATE`, [id]);
    return rows[0] ?? null;
  },

  async findById(id, client = pool) {
    const { rows } = await client.query(`SELECT ${COUPON_COLUMNS} FROM coupons c WHERE c.id = $1`, [id]);
    return rows[0] ?? null;
  },

  /** Active, currently in-date, not globally exhausted -- the only coupons worth discovering as a customer. */
  async listActive(client = pool) {
    const { rows } = await client.query(
      `SELECT ${COUPON_COLUMNS} FROM coupons c
        WHERE c.is_active AND now() BETWEEN c.valid_from AND c.valid_to
          AND (c.usage_limit IS NULL OR c.used_count < c.usage_limit)
        ORDER BY c.discount_type, c.discount_value DESC`,
    );
    return rows;
  },

  /** Every coupon's hotel/city restrictions in two batched queries, grouped by coupon id -- never N+1. */
  async restrictionsFor(couponIds, client = pool) {
    if (couponIds.length === 0) return { hotelsByCoupon: new Map(), citiesByCoupon: new Map() };
    const [hotelRows, cityRows] = await Promise.all([
      client.query(
        `SELECT ch.coupon_id, h.id, h.name FROM coupon_hotels ch JOIN hotels h ON h.id = ch.hotel_id WHERE ch.coupon_id = ANY($1::bigint[])`,
        [couponIds],
      ),
      client.query(`SELECT coupon_id, city FROM coupon_destinations WHERE coupon_id = ANY($1::bigint[])`, [couponIds]),
    ]);
    const hotelsByCoupon = new Map();
    for (const row of hotelRows.rows) (hotelsByCoupon.get(row.coupon_id) ?? hotelsByCoupon.set(row.coupon_id, []).get(row.coupon_id)).push({ id: row.id, name: row.name });
    const citiesByCoupon = new Map();
    for (const row of cityRows.rows) (citiesByCoupon.get(row.coupon_id) ?? citiesByCoupon.set(row.coupon_id, []).get(row.coupon_id)).push(row.city);
    return { hotelsByCoupon, citiesByCoupon };
  },

  async hotelIds(couponId, client = pool) {
    const { rows } = await client.query(`SELECT hotel_id FROM coupon_hotels WHERE coupon_id = $1`, [couponId]);
    return rows.map((row) => row.hotel_id);
  },

  async cities(couponId, client = pool) {
    const { rows } = await client.query(`SELECT city FROM coupon_destinations WHERE coupon_id = $1`, [couponId]);
    return rows.map((row) => row.city);
  },

  async setRestrictions(client, couponId, { hotelIds = [], cities = [] }) {
    await client.query(`DELETE FROM coupon_hotels WHERE coupon_id = $1`, [couponId]);
    await client.query(`DELETE FROM coupon_destinations WHERE coupon_id = $1`, [couponId]);
    for (const hotelId of hotelIds) {
      await client.query(`INSERT INTO coupon_hotels (coupon_id, hotel_id) VALUES ($1, $2)`, [couponId, hotelId]);
    }
    for (const city of cities) {
      await client.query(`INSERT INTO coupon_destinations (coupon_id, city) VALUES ($1, $2)`, [couponId, city.trim()]);
    }
  },

  async incrementUsedCount(client, couponId, by = 1) {
    await client.query(`UPDATE coupons SET used_count = used_count + $2 WHERE id = $1`, [couponId, by]);
  },

  async insertPendingUsage(client, { couponId, holdId, userId, discountMinor }) {
    const { rows } = await client.query(
      `INSERT INTO coupon_usages (coupon_id, hold_id, user_id, discount_minor, status)
       VALUES ($1, $2, $3, $4, 'PENDING') RETURNING id`,
      [couponId, holdId, userId, discountMinor],
    );
    return rows[0].id;
  },

  async pendingUsageForHold(holdId, client = pool) {
    const { rows } = await client.query(
      `SELECT id, coupon_id, discount_minor FROM coupon_usages WHERE hold_id = $1 AND status = 'PENDING'`,
      [holdId],
    );
    return rows[0] ?? null;
  },

  /** Releases a hold's pending usage and gives the slot back to the coupon, in one place. No-op if none. */
  async releaseUsageForHold(client, holdId) {
    const { rows } = await client.query(
      `UPDATE coupon_usages SET status = 'RELEASED' WHERE hold_id = $1 AND status = 'PENDING' RETURNING coupon_id`,
      [holdId],
    );
    if (rows[0]) await client.query(`UPDATE coupons SET used_count = GREATEST(0, used_count - 1) WHERE id = $1`, [rows[0].coupon_id]);
    return rows[0] ?? null;
  },

  async updatePendingUsageAmount(client, holdId, discountMinor) {
    await client.query(`UPDATE coupon_usages SET discount_minor = $2 WHERE hold_id = $1 AND status = 'PENDING'`, [holdId, discountMinor]);
  },

  /** Finalizes the hold's pending usage once its booking is actually confirmed. */
  async confirmUsageForHold(client, holdId, bookingId) {
    await client.query(
      `UPDATE coupon_usages SET status = 'CONFIRMED', booking_id = $2 WHERE hold_id = $1 AND status = 'PENDING'`,
      [holdId, bookingId],
    );
  },

  /** PENDING + CONFIRMED usages by this user for this coupon -- the per-user-limit count. */
  async activeUsageCountForUser(couponId, userId, client = pool) {
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS count FROM coupon_usages WHERE coupon_id = $1 AND user_id = $2 AND status IN ('PENDING', 'CONFIRMED')`,
      [couponId, userId],
    );
    return rows[0].count;
  },

  async hasPriorConfirmedBooking(userId, client = pool) {
    const { rowCount } = await client.query(
      `SELECT 1 FROM bookings WHERE user_id = $1 AND status IN ('PAID', 'CONFIRMED') LIMIT 1`,
      [userId],
    );
    return rowCount > 0;
  },

  // ---- admin CRUD and analytics ----------------------------------------------------------------------------

  async list({ q, isActive, page, limit }) {
    const params = [];
    const param = (value) => {
      params.push(value);
      return `$${params.length}`;
    };
    const clauses = [];
    if (q) clauses.push(`c.code ILIKE ${param(`%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`)}`);
    if (isActive != null) clauses.push(`c.is_active = ${param(isActive)}`);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(limit, (page - 1) * limit);
    const { rows } = await pool.query(
      `SELECT ${COUPON_COLUMNS}, COUNT(*) OVER()::int AS total_count
         FROM coupons c ${where}
        ORDER BY c.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: rows[0]?.total_count ?? 0 };
  },

  async insert(client, values) {
    const columns = Object.keys(values);
    const { rows } = await client.query(
      `INSERT INTO coupons (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      Object.values(values),
    );
    return rows[0].id;
  },

  async update(client, id, values) {
    const columns = Object.keys(values);
    if (columns.length === 0) return;
    const sets = columns.map((c, i) => `${c} = $${i + 2}`);
    await client.query(`UPDATE coupons SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [id, ...Object.values(values)]);
  },

  async setActive(client, id, isActive) {
    await client.query(`UPDATE coupons SET is_active = $2, updated_at = now() WHERE id = $1`, [id, isActive]);
  },

  /** Only ever deletes a coupon that was never used -- the service checks used_count first. */
  async remove(client, id) {
    await client.query(`DELETE FROM coupons WHERE id = $1`, [id]);
  },

  async usageStats(couponId) {
    const { rows } = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'CONFIRMED')::int AS confirmed_count,
              COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending_count,
              COALESCE(SUM(discount_minor) FILTER (WHERE status = 'CONFIRMED'), 0)::bigint AS total_discount_minor
         FROM coupon_usages WHERE coupon_id = $1`,
      [couponId],
    );
    return rows[0];
  },

  async recentUsages(couponId, limit = 20) {
    const { rows } = await pool.query(
      `SELECT cu.id, cu.status, cu.discount_minor, cu.created_at, cu.user_id,
              u.email::text AS email, u.first_name, u.last_name,
              b.id AS booking_id, b.booking_ref
         FROM coupon_usages cu
         JOIN users u ON u.id = cu.user_id
         LEFT JOIN bookings b ON b.id = cu.booking_id
        WHERE cu.coupon_id = $1
        ORDER BY cu.created_at DESC
        LIMIT $2`,
      [couponId, limit],
    );
    return rows;
  },
};
