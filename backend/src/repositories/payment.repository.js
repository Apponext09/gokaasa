import { pool } from '../db/pool.js';

const PAYMENT_COLUMNS = `
  p.id, p.booking_id, p.provider, p.provider_order_id, p.provider_payment_id, p.amount_minor, p.currency, p.status,
  p.failure_reason, p.paid_at, p.attempt, p.gateway_mode, p.provider_payload, p.created_at, p.updated_at
`;

const REFUND_COLUMNS = `
  r.id, r.payment_id, r.booking_id, r.amount_minor, r.status, r.provider_refund_id, r.reason, r.idempotency_key,
  r.created_at, r.processed_at
`;

export const paymentRepository = {
  async insertPayment(client, values) {
    const { rows } = await client.query(
      `INSERT INTO payments (booking_id, provider, provider_order_id, amount_minor, currency, status, attempt, gateway_mode, provider_payload)
       VALUES ($1, 'RAZORPAY', $2, $3, $4, 'PENDING', $5, $6, $7)
       RETURNING id`,
      [values.bookingId, values.orderId, values.amountMinor, values.currency, values.attempt, values.gatewayMode, JSON.stringify({ receipt: values.receipt })],
    );
    return rows[0].id;
  },

  /** The open checkout for a booking, if one exists. Reused so a double click never creates two orders. */
  async openPaymentForBooking(client, bookingId) {
    const { rows } = await client.query(
      `SELECT ${PAYMENT_COLUMNS} FROM payments p
        WHERE p.booking_id = $1 AND p.status IN ('CREATED', 'PENDING')
        ORDER BY p.attempt DESC LIMIT 1`,
      [bookingId],
    );
    return rows[0] ?? null;
  },

  async nextAttempt(client, bookingId) {
    const { rows } = await client.query(`SELECT COALESCE(MAX(attempt), 0)::int + 1 AS next FROM payments WHERE booking_id = $1`, [bookingId]);
    return rows[0].next;
  },

  async findByOrder(orderId, client = pool) {
    const { rows } = await client.query(`SELECT ${PAYMENT_COLUMNS} FROM payments p WHERE p.provider_order_id = $1`, [orderId]);
    return rows[0] ?? null;
  },

  async findById(id, client = pool) {
    const { rows } = await client.query(`SELECT ${PAYMENT_COLUMNS} FROM payments p WHERE p.id = $1`, [id]);
    return rows[0] ?? null;
  },

  /** Locks the payment row for a settlement decision. */
  async lockByOrder(orderId, client) {
    const { rows } = await client.query(`SELECT ${PAYMENT_COLUMNS} FROM payments p WHERE p.provider_order_id = $1 FOR UPDATE`, [orderId]);
    return rows[0] ?? null;
  },

  async findSuccessfulForBooking(bookingId, client = pool) {
    const { rows } = await client.query(
      `SELECT ${PAYMENT_COLUMNS} FROM payments p WHERE p.booking_id = $1 AND p.status IN ('SUCCESS', 'REFUNDED') LIMIT 1`,
      [bookingId],
    );
    return rows[0] ?? null;
  },

  async paymentsForBooking(bookingId, client = pool) {
    const { rows } = await client.query(
      `SELECT ${PAYMENT_COLUMNS} FROM payments p WHERE p.booking_id = $1 ORDER BY p.attempt, p.id`,
      [bookingId],
    );
    return rows;
  },

  async updatePayment(client, id, status, extra = {}) {
    const columns = Object.keys(extra);
    const sets = [`status = $2`, `updated_at = now()`, ...columns.map((c, i) => `${c} = $${i + 3}`)];
    await client.query(`UPDATE payments SET ${sets.join(', ')} WHERE id = $1`, [id, status, ...Object.values(extra)]);
  },

  async insertRefund(client, values) {
    const { rows } = await client.query(
      `INSERT INTO refunds (payment_id, booking_id, amount_minor, status, reason, idempotency_key)
       VALUES ($1, $2, $3, 'PENDING', $4, $5)
       RETURNING id`,
      [values.paymentId, values.bookingId, values.amountMinor, values.reason, values.idempotencyKey],
    );
    return rows[0].id;
  },

  /** The one refund that is pending, in flight, or done for a booking, if any. */
  async activeRefundForBooking(bookingId, client = pool) {
    const { rows } = await client.query(
      `SELECT ${REFUND_COLUMNS} FROM refunds r
        WHERE r.booking_id = $1 AND r.status IN ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED')
        ORDER BY r.id DESC LIMIT 1`,
      [bookingId],
    );
    return rows[0] ?? null;
  },

  async lockRefund(id, client) {
    const { rows } = await client.query(`SELECT ${REFUND_COLUMNS} FROM refunds r WHERE r.id = $1 FOR UPDATE`, [id]);
    return rows[0] ?? null;
  },

  async findRefundById(id, client = pool) {
    const { rows } = await client.query(`SELECT ${REFUND_COLUMNS} FROM refunds r WHERE r.id = $1`, [id]);
    return rows[0] ?? null;
  },

  async updateRefund(client, id, status, extra = {}) {
    const columns = Object.keys(extra);
    const sets = [`status = $2`, ...columns.map((c, i) => `${c} = $${i + 3}`)];
    if (status === 'SUCCESS' || status === 'FAILED') sets.push(`processed_at = now()`);
    await client.query(`UPDATE refunds SET ${sets.join(', ')} WHERE id = $1`, [id, status, ...Object.values(extra)]);
  },

  async refundsForBooking(bookingId, client = pool) {
    const { rows } = await client.query(`SELECT ${REFUND_COLUMNS} FROM refunds r WHERE r.booking_id = $1 ORDER BY r.id`, [bookingId]);
    return rows;
  },

  /**
   * Records a webhook delivery. The unique provider event id makes a repeat delivery a no-op: the returned
   * row is null when the event was already recorded.
   */
  async recordWebhookEvent(client, values) {
    const { rows } = await client.query(
      `INSERT INTO payment_webhook_events (provider_event_id, event_type, provider_payment_id, provider_order_id, payload)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider_event_id) DO NOTHING
       RETURNING id`,
      [values.eventId, values.eventType, values.paymentId, values.orderId, JSON.stringify(values.payload)],
    );
    return rows[0] ?? null;
  },

  async findWebhookEvent(eventId, client = pool) {
    const { rows } = await client.query(`SELECT status FROM payment_webhook_events WHERE provider_event_id = $1`, [eventId]);
    return rows[0] ?? null;
  },

  async setWebhookStatus(client, eventId, status) {
    await client.query(
      `UPDATE payment_webhook_events SET status = $2, processed_at = now() WHERE provider_event_id = $1`,
      [eventId, status],
    );
  },
};
