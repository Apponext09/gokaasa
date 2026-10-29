import { pool } from '../db/pool.js';

const DETAIL_SELECT = `
  r.*, h.name AS hotel_name, h.city AS hotel_city, h.status AS hotel_status,
  submitter.first_name AS submitter_first_name, submitter.last_name AS submitter_last_name,
  reviewer.first_name AS reviewer_first_name, reviewer.last_name AS reviewer_last_name,
  decision.first_name AS decision_first_name, decision.last_name AS decision_last_name
`;

export const hotelReviewRepository = {
  async latestForHotel(hotelId, client = pool, { lock = false } = {}) {
    const { rows } = await client.query(
      `SELECT ${DETAIL_SELECT}
         FROM hotel_reviews r
         JOIN hotels h ON h.id = r.hotel_id
         LEFT JOIN users submitter ON submitter.id = r.submitted_by
         LEFT JOIN users reviewer ON reviewer.id = r.assigned_reviewer_id
         LEFT JOIN users decision ON decision.id = r.reviewed_by
        WHERE r.hotel_id = $1
        ORDER BY r.round_number DESC LIMIT 1${lock ? ' FOR UPDATE OF r' : ''}`,
      [hotelId],
    );
    return rows[0] ?? null;
  },

  async list({ page, limit, status, assignedTo }, client = pool) {
    const params = [];
    const clauses = [`h.deleted_at IS NULL`];
    if (status) { params.push(status); clauses.push(`r.status = $${params.length}`); }
    if (assignedTo) { params.push(assignedTo); clauses.push(`r.assigned_reviewer_id = $${params.length}`); }
    params.push(limit, (page - 1) * limit);
    const { rows } = await client.query(
      `SELECT ${DETAIL_SELECT}, COUNT(*) OVER()::int AS total_count
         FROM hotel_reviews r
         JOIN hotels h ON h.id = r.hotel_id
         LEFT JOIN users submitter ON submitter.id = r.submitted_by
         LEFT JOIN users reviewer ON reviewer.id = r.assigned_reviewer_id
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

  async issues(reviewId, client = pool) {
    const { rows } = await client.query(
      `SELECT i.*, u.first_name AS creator_first_name, u.last_name AS creator_last_name,
              f.first_name AS fixer_first_name, f.last_name AS fixer_last_name,
              v.first_name AS verifier_first_name, v.last_name AS verifier_last_name
         FROM hotel_review_issues i
         LEFT JOIN users u ON u.id = i.created_by
         LEFT JOIN users f ON f.id = i.fixed_by
         LEFT JOIN users v ON v.id = i.verified_by
        WHERE i.review_id = $1 ORDER BY i.created_at, i.id`,
      [reviewId],
    );
    return rows;
  },

  async addIssue(client, reviewId, issue, actorId) {
    const { rows } = await client.query(
      `INSERT INTO hotel_review_issues (review_id, section, field_name, severity, comment, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [reviewId, issue.section, issue.fieldName ?? null, issue.severity, issue.comment, actorId],
    );
    await this.addEvent(client, reviewId, 'ISSUE_ADDED', actorId, issue.comment, { issueId: rows[0].id, section: issue.section });
    return rows[0];
  },

  async issueForReview(issueId, reviewId, client = pool, { lock = false } = {}) {
    const { rows } = await client.query(
      `SELECT * FROM hotel_review_issues WHERE id = $1 AND review_id = $2${lock ? ' FOR UPDATE' : ''}`,
      [issueId, reviewId],
    );
    return rows[0] ?? null;
  },

  async updateIssue(client, issueId, changes) {
    const keys = Object.keys(changes);
    const values = Object.values(changes);
    const assignments = keys.map((key, index) => `${key} = $${index + 2}`);
    const { rows } = await client.query(
      `UPDATE hotel_review_issues SET ${assignments.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
      [issueId, ...values],
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

  async listReviewers(client = pool) {
    const { rows } = await client.query(
      `SELECT u.id, u.first_name, u.last_name, u.email::text AS email
         FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
        WHERE r.code = 'HOTEL_REVIEW_EXECUTIVE' AND u.is_active AND u.deleted_at IS NULL
        ORDER BY u.first_name, u.last_name, u.id`,
    );
    return rows;
  },
};

