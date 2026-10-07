import { pool } from '../db/pool.js';

export const fieldProvenanceRepository = {
  async listForHotel(hotelId, client = pool) {
    const { rows } = await client.query(`SELECT * FROM hotel_field_states WHERE hotel_id = $1`, [hotelId]);
    return Object.fromEntries(rows.map((row) => [row.field, row]));
  },

  /** Records provenance for fields that were just written, replacing any previous state for them. */
  async upsertSource(client, hotelId, field, { source, externalValue = null }) {
    await client.query(
      `INSERT INTO hotel_field_states (hotel_id, field, source, external_value, pending_external_value, verified_at, verified_by, updated_at)
       VALUES ($1, $2, $3, $4, NULL, NULL, NULL, now())
       ON CONFLICT (hotel_id, field) DO UPDATE SET
         source = EXCLUDED.source,
         external_value = COALESCE(EXCLUDED.external_value, hotel_field_states.external_value),
         pending_external_value = NULL,
         verified_at = NULL,
         verified_by = NULL,
         updated_at = now()`,
      [hotelId, field, source, externalValue],
    );
  },

  async markVerified(client, hotelId, field, userId) {
    await client.query(
      `INSERT INTO hotel_field_states (hotel_id, field, source, verified_at, verified_by, updated_at)
       VALUES ($1, $2, 'MANUALLY_MODIFIED', now(), $3, now())
       ON CONFLICT (hotel_id, field) DO UPDATE SET verified_at = now(), verified_by = $3, updated_at = now()`,
      [hotelId, field, userId],
    );
  },

  /** Stores a newer provider value for a protected field without applying it. */
  async setSuggestion(client, hotelId, field, pendingValue) {
    await client.query(
      `UPDATE hotel_field_states SET pending_external_value = $3, updated_at = now() WHERE hotel_id = $1 AND field = $2`,
      [hotelId, field, pendingValue],
    );
  },

  /**
   * Stores a suggestion, creating the provenance row when the field was never tracked. An untracked
   * field is treated as admin-edited, which is the conservative reading.
   */
  async upsertSuggestion(client, hotelId, field, pendingValue) {
    await client.query(
      `INSERT INTO hotel_field_states (hotel_id, field, source, pending_external_value, updated_at)
       VALUES ($1, $2, 'MANUALLY_MODIFIED', $3, now())
       ON CONFLICT (hotel_id, field) DO UPDATE SET pending_external_value = EXCLUDED.pending_external_value, updated_at = now()`,
      [hotelId, field, pendingValue],
    );
  },

  async clearSuggestion(client, hotelId, field) {
    await client.query(
      `UPDATE hotel_field_states SET pending_external_value = NULL, updated_at = now()
        WHERE hotel_id = $1 AND field = $2 AND pending_external_value IS NOT NULL`,
      [hotelId, field],
    );
  },
};
