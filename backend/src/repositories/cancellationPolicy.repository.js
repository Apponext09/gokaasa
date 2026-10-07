import { pool } from '../db/pool.js';

const POLICY_COLUMNS = `
  id, hotel_id, code, name, description, is_non_refundable, cancellation_deadline_hours, refund_percent, status,
  created_at, updated_at
`;

export const cancellationPolicyRepository = {
  async listForHotel(hotelId, client = pool) {
    const { rows } = await client.query(
      `SELECT ${POLICY_COLUMNS} FROM cancellation_policies WHERE hotel_id = $1 AND deleted_at IS NULL ORDER BY code`,
      [hotelId],
    );
    return rows;
  },

  async findById(id, client = pool) {
    const { rows } = await client.query(
      `SELECT ${POLICY_COLUMNS} FROM cancellation_policies WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] ?? null;
  },

  async existsCode(hotelId, code, exceptId, client = pool) {
    const { rowCount } = await client.query(
      `SELECT 1 FROM cancellation_policies WHERE hotel_id = $1 AND code = $2 AND deleted_at IS NULL AND ($3::bigint IS NULL OR id <> $3)`,
      [hotelId, code, exceptId ?? null],
    );
    return rowCount > 0;
  },

  async insert(client, values) {
    const columns = Object.keys(values);
    const { rows } = await client.query(
      `INSERT INTO cancellation_policies (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      Object.values(values),
    );
    return rows[0].id;
  },

  async update(client, id, changes) {
    const columns = Object.keys(changes);
    if (columns.length === 0) return;
    await client.query(
      `UPDATE cancellation_policies SET ${columns.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`,
      [id, ...Object.values(changes)],
    );
  },

  /** Number of rate plans and room types still pointing at the policy. Such policies cannot be removed. */
  async usageCount(id, client = pool) {
    const { rows } = await client.query(
      `SELECT (SELECT COUNT(*) FROM rate_plans WHERE cancellation_policy_id = $1 AND deleted_at IS NULL)
            + (SELECT COUNT(*) FROM room_types WHERE cancellation_policy_id = $1 AND deleted_at IS NULL) AS count`,
      [id],
    );
    return Number(rows[0].count);
  },

  /** Policy that applies to a rate plan: the plan's own policy, falling back to the room type's policy. */
  async effectiveForPlan(planId, client = pool) {
    const { rows } = await client.query(
      `SELECT cp.id, cp.code, cp.name, cp.description, cp.is_non_refundable, cp.cancellation_deadline_hours, cp.refund_percent
         FROM rate_plans p
         JOIN room_types rt ON rt.id = p.room_type_id
         JOIN cancellation_policies cp ON cp.id = COALESCE(p.cancellation_policy_id, rt.cancellation_policy_id)
        WHERE p.id = $1`,
      [planId],
    );
    return rows[0] ?? null;
  },
};
