import { pool } from '../db/pool.js';

function toSettlement(row) {
  return {
    id: row.id,
    hotelId: row.hotel_id,
    status: row.status,
    currency: row.currency,
    totalMinor: Number(row.total_minor),
    createdBy: row.created_by,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    paidAt: row.paid_at,
    payoutReference: row.payout_reference,
    reversedAt: row.reversed_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const settlementRepository = {
  async insert(client, { hotelId, currency, totalMinor, createdBy }) {
    const { rows } = await client.query(
      `INSERT INTO settlements (hotel_id, currency, total_minor, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
      [hotelId, currency, totalMinor, createdBy],
    );
    return rows[0].id;
  },

  async lock(id, client) {
    const { rows } = await client.query(`SELECT * FROM settlements WHERE id = $1 FOR UPDATE`, [id]);
    return rows[0] ? toSettlement(rows[0]) : null;
  },

  async findById(id, client = pool) {
    const { rows } = await client.query(`SELECT * FROM settlements WHERE id = $1`, [id]);
    return rows[0] ? toSettlement(rows[0]) : null;
  },

  async setStatus(client, id, status, extra = {}) {
    const columns = Object.keys(extra);
    const assignments = ['status = $2', 'updated_at = now()', ...columns.map((col, i) => `${col} = $${i + 3}`)];
    await client.query(
      `UPDATE settlements SET ${assignments.join(', ')} WHERE id = $1`,
      [id, status, ...columns.map((col) => extra[col])],
    );
  },

  async list({ page, limit, status }, hotelIds) {
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
    const { rows } = await pool.query(
      `SELECT *, COUNT(*) OVER()::int AS total_count FROM settlements
        WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { total: rows[0]?.total_count ?? 0, rows: rows.map(toSettlement) };
  },

  async insertLineItems(client, settlementId, entries) {
    if (entries.length === 0) return;
    const values = [];
    const placeholders = entries.map((entry, index) => {
      values.push(settlementId, entry.id, entry.amountMinor);
      const base = index * 3;
      return `($${base + 1}, $${base + 2}, $${base + 3})`;
    });
    await client.query(
      `INSERT INTO settlement_line_items (settlement_id, ledger_entry_id, amount_minor) VALUES ${placeholders.join(', ')}`,
      values,
    );
  },

  /** Totals for the earnings-summary dashboard: how much is mid-flight vs. already paid out, for this
   * hotel scope. `hotelIds === null` means unscoped (ADMIN, every hotel). */
  async sumByStatus(hotelIds, client = pool) {
    const params = [];
    let where = '1=1';
    if (hotelIds != null) {
      params.push(hotelIds);
      where += ` AND hotel_id = ANY($${params.length}::bigint[])`;
    }
    const { rows } = await client.query(
      `SELECT status, COALESCE(SUM(total_minor), 0)::bigint AS total_minor FROM settlements WHERE ${where} GROUP BY status`,
      params,
    );
    return rows.map((row) => ({ status: row.status, totalMinor: Number(row.total_minor) }));
  },

  async lineItemsForSettlement(settlementId, client = pool) {
    const { rows } = await client.query(
      `SELECT sli.id, sli.amount_minor, ple.* FROM settlement_line_items sli
         JOIN partner_ledger_entries ple ON ple.id = sli.ledger_entry_id
        WHERE sli.settlement_id = $1 ORDER BY ple.created_at`,
      [settlementId],
    );
    return rows.map((row) => ({
      id: row.id,
      amountMinor: Number(row.amount_minor),
      entryType: row.entry_type,
      direction: row.direction,
      bookingId: row.booking_id,
      refundId: row.refund_id,
      createdAt: row.created_at,
    }));
  },
};
