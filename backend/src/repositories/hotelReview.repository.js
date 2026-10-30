import { pool } from '../db/pool.js';

const DETAIL_SELECT = `
  r.*, h.name AS hotel_name, h.city AS hotel_city, h.status AS hotel_status,
  submitter.first_name AS submitter_first_name, submitter.last_name AS submitter_last_name,
  decision.first_name AS decision_first_name, decision.last_name AS decision_last_name
`;

export const hotelReviewRepository = {
  async latestForHotel(hotelId, client = pool, { lock = false } = {}) {
    const { rows } = await client.query(
      `SELECT ${DETAIL_SELECT}
         FROM hotel_reviews r
         JOIN hotels h ON h.id = r.hotel_id
         LEFT JOIN users submitter ON submitter.id = r.submitted_by
         LEFT JOIN users decision ON decision.id = r.reviewed_by
        WHERE r.hotel_id = $1
        ORDER BY r.round_number DESC LIMIT 1${lock ? ' FOR UPDATE OF r' : ''}`,
      [hotelId],
    );
    return rows[0] ?? null;
  },

  async list({ page, limit, status }, client = pool) {
    const params = [];
    const clauses = [`h.deleted_at IS NULL`];
    if (status) { params.push(status); clauses.push(`r.status = $${params.length}`); }
    params.push(limit, (page - 1) * limit);
    const { rows } = await client.query(
      `SELECT ${DETAIL_SELECT}, COUNT(*) OVER()::int AS total_count
         FROM hotel_reviews r
         JOIN hotels h ON h.id = r.hotel_id
         LEFT JOIN users submitter ON submitter.id = r.submitted_by
         LEFT JOIN users decision ON decision.id = r.reviewed_by
        WHERE ${clauses.join(' AND ')}
          AND r.round_number = (SELECT MAX(x.round_number) FROM hotel_reviews x WHERE x.hotel_id = r.hotel_id)
        ORDER BY CASE r.status WHEN 'PENDING' THEN 0 WHEN 'CHANGES_REQUESTED' THEN 1 WHEN 'APPROVED' THEN 2 ELSE 3 END,
                 r.submitted_at ASC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: rows[0]?.total_count ?? 0 };
  },

  async createSubmission(client, hotelId, actorId) {
    const latest = await this.latestForHotel(hotelId, client, { lock: true });
    if (latest?.status === 'CHANGES_REQUESTED') {
      const { rows } = await client.query(
        `UPDATE hotel_reviews SET status = 'PENDING', submission_count = submission_count + 1,
                submitted_by = $2, submitted_at = now(), reviewed_by = NULL,
                reviewed_at = NULL, decision_summary = NULL, updated_at = now()
          WHERE id = $1 RETURNING *`,
        [latest.id, actorId],
      );
      await this.addEvent(client, latest.id, 'RESUBMITTED', actorId);
      return rows[0];
    }
    if (latest?.status === 'PENDING') throw new Error('REVIEW_ALREADY_PENDING');
    const round = (latest?.round_number ?? 0) + 1;
    const { rows } = await client.query(
      `INSERT INTO hotel_reviews (hotel_id, round_number, status, submitted_by)
       VALUES ($1, $2, 'PENDING', $3) RETURNING *`,
      [hotelId, round, actorId],
    );
    await this.addEvent(client, rows[0].id, 'SUBMITTED', actorId);
    return rows[0];
  },

  async update(client, reviewId, changes) {
    const keys = Object.keys(changes);
    const values = Object.values(changes);
    const assignments = keys.map((key, index) => `${key} = $${index + 2}`);
    const { rows } = await client.query(
      `UPDATE hotel_reviews SET ${assignments.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
      [reviewId, ...values],
    );
    return rows[0];
  },

  async events(reviewId, client = pool) {
    const { rows } = await client.query(
      `SELECT e.*, u.first_name, u.last_name FROM hotel_review_events e
       LEFT JOIN users u ON u.id = e.actor_id WHERE e.review_id = $1 ORDER BY e.created_at, e.id`,
      [reviewId],
    );
    return rows;
  },

  async addEvent(client, reviewId, type, actorId, message = null, metadata = {}) {
    await client.query(
      `INSERT INTO hotel_review_events (review_id, event_type, actor_id, message, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [reviewId, type, actorId, message, JSON.stringify(metadata)],
    );
  },
};

