import { pool } from '../db/pool.js';

export const newsletterRepository = {
  /** Idempotent: a repeat email, or one that previously unsubscribed, just (re)activates the one row. */
  async subscribe(email, client = pool) {
    const { rows } = await client.query(
      `INSERT INTO newsletter_subscribers (email) VALUES ($1)
       ON CONFLICT (email) DO UPDATE SET unsubscribed_at = NULL
       RETURNING id, email, subscribed_at`,
      [email],
    );
    return rows[0];
  },
};
