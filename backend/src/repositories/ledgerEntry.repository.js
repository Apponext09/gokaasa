import { pool } from '../db/pool.js';

function toEntry(row) {
  return {
    id: row.id,
    hotelId: row.hotel_id,
    bookingId: row.booking_id,
    refundId: row.refund_id,
    settlementId: row.settlement_id,
    entryType: row.entry_type,
    direction: row.direction,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    description: row.description,
    createdAt: row.created_at,
  };
}

export const ledgerEntryRepository = {
  /** One round trip for a set of paired entries (e.g. BOOKING_EARNING + PLATFORM_COMMISSION). */
  async insertMany(client, rows) {
    if (rows.length === 0) return [];
    const columns = ['hotel_id', 'booking_id', 'refund_id', 'settlement_id', 'entry_type', 'direction', 'amount_minor', 'currency', 'idempotency_key', 'description'];
    const values = [];
    const placeholders = rows.map((row, index) => {
      const base = index * columns.length;
      values.push(
        row.hotelId, row.bookingId ?? null, row.refundId ?? null, row.settlementId ?? null,
        row.entryType, row.direction, row.amountMinor, row.currency, row.idempotencyKey ?? null, row.description ?? null,
      );
      return `(${columns.map((_, i) => `$${base + i + 1}`).join(', ')})`;
    });
    const { rows: inserted } = await client.query(
      `INSERT INTO partner_ledger_entries (${columns.join(', ')}) VALUES ${placeholders.join(', ')} RETURNING id`,
      values,
    );
    return inserted.map((row) => row.id);
  },

  /** Locks this hotel's unclaimed rows for settlement creation. SKIP LOCKED lets two concurrent
   * "create settlement" calls for the same hotel split the available rows instead of blocking/deadlocking. */
  async lockUnclaimedForHotel(client, hotelId) {
    const { rows } = await client.query(
      `SELECT * FROM partner_ledger_entries WHERE hotel_id = $1 AND settlement_id IS NULL ORDER BY id FOR UPDATE SKIP LOCKED`,
      [hotelId],
    );
    return rows.map(toEntry);
  },

  /** Permanent, one-time claim. The WHERE clause is the actual double-allocation guard: a row already claimed is left untouched. */
  async claimForSettlement(client, ids, settlementId) {
    if (ids.length === 0) return;
    await client.query(
      `UPDATE partner_ledger_entries SET settlement_id = $2 WHERE id = ANY($1::bigint[]) AND settlement_id IS NULL`,
      [ids, settlementId],
    );
  },

  /** Current unclaimed balance per hotel (CREDIT minus DEBIT). Positive = available to settle. `hotelIds
   * === null` means unscoped (ADMIN, every hotel); an array (possibly empty) filters to those hotels. */
  async balanceForHotels(hotelIds, client = pool) {
    const params = [];
    let where = 'settlement_id IS NULL';
    if (hotelIds != null) {
      params.push(hotelIds);
      where += ` AND hotel_id = ANY($${params.length}::bigint[])`;
    }
    const { rows } = await client.query(
      `SELECT hotel_id,
              COALESCE(SUM(amount_minor) FILTER (WHERE direction = 'CREDIT'), 0)::bigint
                - COALESCE(SUM(amount_minor) FILTER (WHERE direction = 'DEBIT'), 0)::bigint AS balance_minor
         FROM partner_ledger_entries
        WHERE ${where}
        GROUP BY hotel_id`,
      params,
    );
    return rows.map((row) => ({ hotelId: row.hotel_id, balanceMinor: Number(row.balance_minor) }));
  },

  async listForHotels(hotelIds, { page, limit, bookingId, entryType, from, to }, client = pool) {
    const params = [];
    let where = '1=1';
    if (hotelIds != null) {
      params.push(hotelIds);
      where += ` AND hotel_id = ANY($${params.length}::bigint[])`;
    }
    if (bookingId) {
      params.push(bookingId);
      where += ` AND booking_id = $${params.length}`;
    }
    if (entryType) {
      params.push(entryType);
      where += ` AND entry_type = $${params.length}`;
    }
    if (from) {
      params.push(from);
      where += ` AND created_at >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      where += ` AND created_at < $${params.length}::date + interval '1 day'`;
    }
    params.push(limit, (page - 1) * limit);
    const { rows } = await client.query(
      `SELECT *, COUNT(*) OVER()::int AS total_count FROM partner_ledger_entries
        WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { total: rows[0]?.total_count ?? 0, rows: rows.map(toEntry) };
  },

  /** Grouped sums by entry type, for the earnings-summary dashboard. Always derived from the ledger
   * itself. `hotelIds === null` means unscoped (ADMIN, every hotel). */
  async summaryForHotels(hotelIds, client = pool) {
    const params = [];
    let where = '1=1';
    if (hotelIds != null) {
      params.push(hotelIds);
      where += ` AND hotel_id = ANY($${params.length}::bigint[])`;
    }
    const { rows } = await client.query(
      `SELECT entry_type, direction, COALESCE(SUM(amount_minor), 0)::bigint AS total_minor
         FROM partner_ledger_entries WHERE ${where} GROUP BY entry_type, direction`,
      params,
    );
    return rows.map((row) => ({ entryType: row.entry_type, direction: row.direction, totalMinor: Number(row.total_minor) }));
  },

  async listForBooking(bookingId, client = pool) {
    const { rows } = await client.query(`SELECT * FROM partner_ledger_entries WHERE booking_id = $1 ORDER BY created_at`, [bookingId]);
    return rows.map(toEntry);
  },
};
