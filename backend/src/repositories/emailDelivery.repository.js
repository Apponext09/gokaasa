import { pool } from '../db/pool.js';

const COLUMNS = `id, event_key, event_type, recipient_type, recipient_email::text AS recipient_email,
  template, payload, status, attempt_count, max_attempts, next_attempt_at, provider_message_id,
  last_error, accepted_at, created_at, updated_at`;

export const emailDeliveryRepository = {
  async enqueue(client, delivery) {
    const { rows } = await client.query(
      `INSERT INTO email_deliveries
         (event_key, event_type, recipient_type, recipient_email, template, payload)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (event_key, recipient_type, recipient_email) DO NOTHING
       RETURNING ${COLUMNS}`,
      [delivery.eventKey, delivery.eventType, delivery.recipientType, delivery.to, delivery.template, JSON.stringify(delivery.payload)],
    );
    return rows[0] ?? null;
  },

  async claimDue(client, { eventKey = null, limit = 20 } = {}) {
    const { rows } = await client.query(
      `SELECT ${COLUMNS}
         FROM email_deliveries
        WHERE status IN ('PENDING', 'FAILED')
          AND attempt_count < max_attempts
          AND next_attempt_at <= now()
          AND ($1::text IS NULL OR event_key = $1)
        ORDER BY next_attempt_at, id
        LIMIT $2
        FOR UPDATE SKIP LOCKED`,
      [eventKey, limit],
    );
    if (rows.length > 0) {
      await client.query(
        `UPDATE email_deliveries
            SET status = 'PROCESSING', attempt_count = attempt_count + 1, updated_at = now()
          WHERE id = ANY($1::bigint[])`,
        [rows.map((row) => row.id)],
      );
    }
    return rows.map((row) => ({ ...row, attempt_count: row.attempt_count + 1 }));
  },

  async markAccepted(id, providerMessageId) {
    await pool.query(
      `UPDATE email_deliveries
          SET status = 'ACCEPTED', provider_message_id = $2, accepted_at = now(), last_error = NULL, updated_at = now()
        WHERE id = $1 AND status = 'PROCESSING'`,
      [id, providerMessageId ?? null],
    );
  },

  async markFailed(id, safeError, attemptCount) {
    const delayMinutes = Math.min(60, 2 ** Math.max(0, attemptCount - 1));
    await pool.query(
      `UPDATE email_deliveries
          SET status = 'FAILED', last_error = $2,
              next_attempt_at = now() + ($3 || ' minutes')::interval, updated_at = now()
        WHERE id = $1 AND status = 'PROCESSING'`,
      [id, String(safeError).slice(0, 500), String(delayMinutes)],
    );
  },

  async releaseStale() {
    await pool.query(
      `UPDATE email_deliveries
          SET status = 'FAILED', last_error = 'Worker interrupted before SMTP response', next_attempt_at = now(), updated_at = now()
        WHERE status = 'PROCESSING' AND updated_at < now() - interval '10 minutes'`,
    );
  },
};

