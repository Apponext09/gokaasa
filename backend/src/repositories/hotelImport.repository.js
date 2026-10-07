import { pool } from '../db/pool.js';

const JOB_COLUMNS = `
  j.id, j.search_query, j.provider, j.external_hotel_id, j.status, j.attempts, j.hotel_id,
  j.raw_response, j.normalized_data, j.error_message, j.created_by, j.started_at,
  j.finished_at, j.created_at, j.updated_at
`;

export const hotelImportRepository = {
  async insertJob(client, { searchQuery, provider, externalHotelId, createdBy }) {
    const { rows } = await client.query(
      `INSERT INTO hotel_import_jobs (search_query, provider, external_hotel_id, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [searchQuery, provider, externalHotelId, createdBy],
    );
    return rows[0].id;
  },

  async findActiveJob(client, provider, externalHotelId) {
    const { rows } = await client.query(
      `SELECT id, status FROM hotel_import_jobs
        WHERE provider = $1 AND external_hotel_id = $2 AND status IN ('PENDING', 'PROCESSING')
        ORDER BY id DESC LIMIT 1`,
      [provider, externalHotelId],
    );
    return rows[0] ?? null;
  },

  async findJobById(id, client = pool) {
    const { rows } = await client.query(`SELECT ${JOB_COLUMNS} FROM hotel_import_jobs j WHERE j.id = $1`, [id]);
    return rows[0] ?? null;
  },

  /** Atomically moves a job from PENDING to PROCESSING. Returns null if another worker already has it. */
  async claimJob(client, id) {
    const { rows } = await client.query(
      `UPDATE hotel_import_jobs
          SET status = 'PROCESSING', attempts = attempts + 1, started_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'PENDING'
        RETURNING id, provider, external_hotel_id, created_by, attempts`,
      [id],
    );
    return rows[0] ?? null;
  },

  async updateJob(client, id, changes) {
    const columns = Object.keys(changes);
    const assignments = columns.map((column, index) => `${column} = $${index + 2}`);
    await client.query(
      `UPDATE hotel_import_jobs SET ${assignments.join(', ')}, updated_at = now() WHERE id = $1`,
      [id, ...Object.values(changes)],
    );
  },

  async appendLog(client, jobId, { level, message, details }) {
    await client.query(
      `INSERT INTO hotel_import_logs (job_id, level, message, details) VALUES ($1, $2, $3, $4)`,
      [jobId, level, message, details ? JSON.stringify(details) : null],
    );
  },

  async listLogs(jobId) {
    const { rows } = await pool.query(
      `SELECT level, message, details, created_at FROM hotel_import_logs WHERE job_id = $1 ORDER BY id ASC`,
      [jobId],
    );
    return rows;
  },

  async listJobs({ page, limit, status }) {
    const params = [];
    let where = 'TRUE';
    if (status) {
      params.push(status);
      where = `j.status = $${params.length}`;
    }
    params.push(limit, (page - 1) * limit);
    const { rows } = await pool.query(
      `SELECT ${JOB_COLUMNS}, COUNT(*) OVER()::int AS total_count
         FROM hotel_import_jobs j
        WHERE ${where}
        ORDER BY j.created_at DESC, j.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: rows[0]?.total_count ?? 0 };
  },

  /** Jobs left PROCESSING by a crash are reset so they run again on boot. */
  async resetInterrupted() {
    const { rowCount } = await pool.query(
      `UPDATE hotel_import_jobs SET status = 'PENDING', updated_at = now() WHERE status = 'PROCESSING'`,
    );
    return rowCount;
  },

  async listPendingIds() {
    const { rows } = await pool.query(`SELECT id FROM hotel_import_jobs WHERE status = 'PENDING' ORDER BY id`);
    return rows.map((row) => row.id);
  },

  /** Dashboard onboarding metrics, all computed from stored data. */
  async onboardingMetrics() {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE finished_at >= date_trunc('day', now()) AND status IN ('COMPLETED', 'REVIEW_REQUIRED'))::int AS imported_today,
        COUNT(*) FILTER (WHERE status = 'FAILED' AND created_at >= now() - interval '30 days')::int AS failed_30d,
        ROUND(AVG(EXTRACT(EPOCH FROM (finished_at - created_at)) / 60)
          FILTER (WHERE status IN ('COMPLETED', 'REVIEW_REQUIRED') AND created_at >= now() - interval '30 days')::numeric, 1) AS avg_minutes_30d,
        COUNT(*) FILTER (WHERE status IN ('COMPLETED', 'REVIEW_REQUIRED') AND created_at >= now() - interval '30 days')::int AS completed_30d
      FROM hotel_import_jobs
    `);
    return rows[0];
  },

  async upsertSource({ provider, displayName }) {
    await pool.query(
      `INSERT INTO external_hotel_sources (provider, display_name)
       VALUES ($1, $2)
       ON CONFLICT (provider) DO UPDATE SET display_name = EXCLUDED.display_name`,
      [provider, displayName],
    );
  },

  async recordSourceSuccess(provider) {
    await pool.query(`UPDATE external_hotel_sources SET last_success_at = now() WHERE provider = $1`, [provider]);
  },

  async recordSourceError(provider, message) {
    await pool.query(
      `UPDATE external_hotel_sources SET last_error_at = now(), last_error = $2 WHERE provider = $1`,
      [provider, message.slice(0, 500)],
    );
  },

  async latestJobIdForHotel(hotelId, client = pool) {
    const { rows } = await client.query(
      `SELECT id FROM hotel_import_jobs WHERE hotel_id = $1 ORDER BY id DESC LIMIT 1`,
      [hotelId],
    );
    return rows[0]?.id ?? null;
  },

  /**
   * Every import that produced this hotel, plus failed attempts for the same external record, so
   * admins can see why a hotel could not be imported before.
   */
  async historyForHotel({ hotelId, provider, externalId }) {
    const { rows } = await pool.query(
      `SELECT ${JOB_COLUMNS}, u.first_name || ' ' || u.last_name AS created_by_name
         FROM hotel_import_jobs j
         LEFT JOIN users u ON u.id = j.created_by
        WHERE j.hotel_id = $1
           OR (j.provider = $2 AND j.external_hotel_id = $3)
        ORDER BY j.created_at DESC, j.id DESC`,
      [hotelId ?? -1, provider ?? '', externalId ?? ''],
    );
    return rows;
  },

  async findJobWithCreator(id) {
    const { rows } = await pool.query(
      `SELECT ${JOB_COLUMNS}, u.first_name || ' ' || u.last_name AS created_by_name
         FROM hotel_import_jobs j
         LEFT JOIN users u ON u.id = j.created_by
        WHERE j.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },

  async markDiscarded(client, jobId) {
    await client.query(
      `UPDATE hotel_import_jobs SET status = 'DISCARDED', updated_at = now() WHERE id = $1`,
      [jobId],
    );
  },

  async listSources() {
    const { rows } = await pool.query(
      `SELECT provider, display_name, is_enabled, last_success_at, last_error_at, last_error FROM external_hotel_sources ORDER BY provider`,
    );
    return rows;
  },
};
