import { pool } from '../db/pool.js';

function toDocument(row) {
  return {
    id: row.id,
    userId: row.user_id,
    docType: row.doc_type,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    uploadedAt: row.uploaded_at,
  };
}

export const partnerDocumentRepository = {
  async insert(client, { userId, docType, storageKey, mimeType, byteSize, contentHash }) {
    const { rows } = await client.query(
      `INSERT INTO partner_documents (user_id, doc_type, storage_key, mime_type, byte_size, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, docType, storageKey, mimeType, byteSize, contentHash],
    );
    return rows[0].id;
  },

  async listForUser(userId, client = pool) {
    const { rows } = await client.query(
      `SELECT * FROM partner_documents WHERE user_id = $1 AND deleted_at IS NULL ORDER BY uploaded_at DESC`,
      [userId],
    );
    return rows.map(toDocument);
  },

  /** Includes storage_key -- only the streaming route needs it, so callers must not expose this row directly. */
  async findById(id, client = pool) {
    const { rows } = await client.query(`SELECT * FROM partner_documents WHERE id = $1 AND deleted_at IS NULL`, [id]);
    return rows[0] ?? null;
  },
};
