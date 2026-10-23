import { pool } from '../db/pool.js';

function toProfile(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    status: row.status,
    businessName: row.business_name,
    businessType: row.business_type,
    gstin: row.gstin,
    pan: row.pan,
    contactPhone: row.contact_phone,
    propertyName: row.property_name,
    propertyCity: row.property_city,
    propertyAddress: row.property_address,
    estimatedRooms: row.estimated_rooms,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const partnerProfileRepository = {
  async create(client, { userId, businessName, businessType, gstin, pan, contactPhone, propertyName, propertyCity, propertyAddress, estimatedRooms }) {
    await client.query(
      `INSERT INTO partner_profiles
         (user_id, business_name, business_type, gstin, pan, contact_phone, property_name, property_city, property_address, estimated_rooms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [userId, businessName, businessType, gstin ?? null, pan ?? null, contactPhone, propertyName, propertyCity, propertyAddress ?? null, estimatedRooms ?? null],
    );
  },

  async findByUserId(userId, client = pool) {
    const { rows } = await client.query(`SELECT * FROM partner_profiles WHERE user_id = $1`, [userId]);
    return toProfile(rows[0]);
  },

  /** Used by the requirePartnerApproved gate and the auth session payload -- null means "not a partner". */
  async statusForUser(userId, client = pool) {
    const { rows } = await client.query(`SELECT status FROM partner_profiles WHERE user_id = $1`, [userId]);
    return rows[0]?.status ?? null;
  },

  async markSubmitted(client, userId) {
    await client.query(
      `UPDATE partner_profiles SET status = 'PENDING_REVIEW', submitted_at = now(), updated_at = now() WHERE user_id = $1`,
      [userId],
    );
  },

  async markReviewed(client, userId, { status, reviewedBy, rejectionReason = null }) {
    await client.query(
      `UPDATE partner_profiles
          SET status = $2, reviewed_at = now(), reviewed_by = $3, rejection_reason = $4, updated_at = now()
        WHERE user_id = $1`,
      [userId, status, reviewedBy, rejectionReason],
    );
  },

  async listForAdmin({ status, page, limit }) {
    const params = [];
    let where = '1=1';
    if (status) {
      params.push(status);
      where += ` AND pp.status = $${params.length}`;
    }
    params.push(limit, (page - 1) * limit);
    const { rows } = await pool.query(
      `SELECT pp.*, u.email::text AS email, u.first_name, u.last_name,
              COUNT(*) OVER()::int AS total_count
         FROM partner_profiles pp JOIN users u ON u.id = pp.user_id
        WHERE ${where}
        ORDER BY pp.submitted_at DESC NULLS LAST, pp.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return {
      total: rows[0]?.total_count ?? 0,
      rows: rows.map((row) => ({ ...toProfile(row), email: row.email, firstName: row.first_name, lastName: row.last_name })),
    };
  },
};
