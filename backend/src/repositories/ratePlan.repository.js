import { pool } from '../db/pool.js';

const PLAN_COLUMNS = `
  p.id, p.hotel_id, p.room_type_id, p.code, p.name, p.description, p.meal_plan,
  (SELECT mp.name FROM meal_plans mp WHERE mp.code = p.meal_plan) AS meal_plan_name, p.is_refundable,
  p.cancellation_policy_id, p.currency, p.discount_percent, p.tax_percent, p.fee_minor, p.status,
  p.base_price_minor, p.pricing_review_required,
  p.created_at, p.updated_at
`;

export const ratePlanRepository = {
  async listForRoomType(roomTypeId, client = pool) {
    const { rows } = await client.query(
      `SELECT ${PLAN_COLUMNS} FROM rate_plans p
        WHERE p.room_type_id = $1 AND p.deleted_at IS NULL ORDER BY p.status ASC, p.meal_plan, p.name`,
      [roomTypeId],
    );
    return rows;
  },

  async findById(id, client = pool) {
    const { rows } = await client.query(
      `SELECT ${PLAN_COLUMNS} FROM rate_plans p WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [id],
    );
    return rows[0] ?? null;
  },

  async existsCode(roomTypeId, code, exceptId, client = pool) {
    const { rowCount } = await client.query(
      `SELECT 1 FROM rate_plans WHERE room_type_id = $1 AND code = $2 AND deleted_at IS NULL AND ($3::bigint IS NULL OR id <> $3)`,
      [roomTypeId, code, exceptId ?? null],
    );
    return rowCount > 0;
  },

  async insert(client, values) {
    const columns = Object.keys(values);
    const { rows } = await client.query(
      `INSERT INTO rate_plans (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      Object.values(values),
    );
    return rows[0].id;
  },

  async update(client, id, changes) {
    const columns = Object.keys(changes);
    if (columns.length === 0) return;
    await client.query(
      `UPDATE rate_plans SET ${columns.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`,
      [id, ...Object.values(changes)],
    );
  },

  /**
   * Stored per-night prices for a set of plans over [from, to). Used for quotes and for the calendar.
   */
  async pricesInRange(planIds, from, to, client = pool) {
    const { rows } = await client.query(
      `SELECT rate_plan_id, stay_date, base_price_minor, discount_minor, tax_minor, fee_minor, final_price_minor
         FROM rate_prices
        WHERE rate_plan_id = ANY($1::bigint[]) AND stay_date >= $2 AND stay_date < $3
        ORDER BY rate_plan_id, stay_date`,
      [planIds, from, to],
    );
    return rows;
  },

  /** Active, permanently-priced plans with their effective cancellation policy. */
  async sellablePlansForRoomTypes(roomTypeIds, from, to, client = pool) {
    const { rows } = await client.query(
      `SELECT p.id, p.room_type_id, p.code, p.name, p.meal_plan, mp.name AS meal_plan_name, p.is_refundable, p.currency,
              p.base_price_minor, p.discount_percent, p.tax_percent, p.fee_minor,
              cp.id AS policy_id, cp.code AS policy_code, cp.name AS policy_name, cp.description AS policy_description,
              cp.is_non_refundable AS policy_is_non_refundable, cp.cancellation_deadline_hours AS policy_deadline_hours,
              cp.refund_percent AS policy_refund_percent
         FROM rate_plans p
         JOIN meal_plans mp ON mp.code = p.meal_plan
         JOIN room_types rt ON rt.id = p.room_type_id
         LEFT JOIN cancellation_policies cp ON cp.id = COALESCE(p.cancellation_policy_id, rt.cancellation_policy_id)
        WHERE p.room_type_id = ANY($1::bigint[]) AND p.status = 'ACTIVE'
          AND p.base_price_minor IS NOT NULL AND p.deleted_at IS NULL
        ORDER BY p.id`,
      [roomTypeIds],
    );
    return rows;
  },

  /** Upserts identical components for every date in `dates` (bulk price update). */
  async upsertPrices(client, planId, dates, components) {
    await client.query(
      `INSERT INTO rate_prices (rate_plan_id, stay_date, base_price_minor, discount_minor, tax_minor, fee_minor, final_price_minor, updated_at)
       SELECT $1::bigint, d, $3::bigint, $4::bigint, $5::bigint, $6::bigint, $7::bigint, now() FROM UNNEST($2::date[]) AS d
       ON CONFLICT (rate_plan_id, stay_date) DO UPDATE SET
         base_price_minor = EXCLUDED.base_price_minor,
         discount_minor = EXCLUDED.discount_minor,
         tax_minor = EXCLUDED.tax_minor,
         fee_minor = EXCLUDED.fee_minor,
         final_price_minor = EXCLUDED.final_price_minor,
         updated_at = now()`,
      [planId, dates, components.base, components.discount, components.tax, components.fee, components.final],
    );
    await client.query(
      `UPDATE rate_plans SET base_price_minor = $2, pricing_review_required = FALSE, updated_at = now() WHERE id = $1`,
      [planId, components.base],
    );
  },

  /** Every stored night for a plan, so changed discount, tax or fee can be recomputed from the base price. */
  async allPricesForPlan(planId, client = pool) {
    const { rows } = await client.query(
      `SELECT stay_date, base_price_minor FROM rate_prices WHERE rate_plan_id = $1`,
      [planId],
    );
    return rows;
  },

  async setPriceComponents(client, planId, stayDate, components) {
    await client.query(
      `UPDATE rate_prices SET discount_minor = $3, tax_minor = $4, fee_minor = $5, final_price_minor = $6, updated_at = now()
        WHERE rate_plan_id = $1 AND stay_date = $2`,
      [planId, stayDate, components.discount, components.tax, components.fee, components.final],
    );
  },
};
