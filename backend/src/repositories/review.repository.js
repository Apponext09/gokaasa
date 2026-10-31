import { pool } from '../db/pool.js';

const REVIEW_COLUMNS = `
  r.id, r.hotel_id, r.booking_id, r.user_id, r.rating, r.title, r.body, r.status,
  r.moderated_by, r.moderated_at, r.moderation_reason, r.created_at, r.updated_at
`;

export const reviewRepository = {
  async insert(client, { hotelId, bookingId, userId, rating, title, body }) {
    const { rows } = await client.query(
      `INSERT INTO reviews (hotel_id, booking_id, user_id, rating, title, body)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${REVIEW_COLUMNS.replaceAll('r.', '')}`,
      [hotelId, bookingId, userId, rating, title ?? null, body ?? null],
    );
    return rows[0];
  },

  async findById(id, client = pool) {
    const { rows } = await client.query(`SELECT ${REVIEW_COLUMNS} FROM reviews r WHERE r.id = $1`, [id]);
    return rows[0] ?? null;
  },

  async lockById(id, client) {
    const { rows } = await client.query(`SELECT ${REVIEW_COLUMNS} FROM reviews r WHERE r.id = $1 FOR UPDATE`, [id]);
    return rows[0] ?? null;
  },

  /** booking_id is UNIQUE, so this also answers "has this booking already been reviewed?". */
  async findByBookingId(bookingId, client = pool) {
    const { rows } = await client.query(`SELECT ${REVIEW_COLUMNS} FROM reviews r WHERE r.booking_id = $1`, [bookingId]);
    return rows[0] ?? null;
  },

  /** Batch form of findByBookingId, for a bookings list that shouldn't run one query per row. */
  async findByBookingIds(bookingIds, client = pool) {
    if (bookingIds.length === 0) return [];
    const { rows } = await client.query(`SELECT ${REVIEW_COLUMNS} FROM reviews r WHERE r.booking_id = ANY($1::bigint[])`, [bookingIds]);
    return rows;
  },

  /** (hotel_id, user_id) is UNIQUE: a guest reviews a hotel once, however many stays they have had there. */
  async findByHotelAndUser(hotelId, userId, client = pool) {
    const { rows } = await client.query(`SELECT ${REVIEW_COLUMNS} FROM reviews r WHERE r.hotel_id = $1 AND r.user_id = $2`, [hotelId, userId]);
    return rows[0] ?? null;
  },

  async update(client, id, changes) {
    const columns = Object.keys(changes);
    if (columns.length === 0) return;
    const assignments = columns.map((column, index) => `${column} = $${index + 2}`);
    await client.query(`UPDATE reviews SET ${assignments.join(', ')}, updated_at = now() WHERE id = $1`, [id, ...Object.values(changes)]);
  },

  async remove(client, id) {
    await client.query(`DELETE FROM reviews WHERE id = $1`, [id]);
  },

  /** Approved reviews for a hotel's own page. Newest/highest/lowest, paginated. */
  async listApprovedForHotel(hotelId, { page, limit, sort }) {
    const orderBy = { newest: 'r.created_at DESC', highest: 'r.rating DESC, r.created_at DESC', lowest: 'r.rating ASC, r.created_at DESC' }[sort] ?? 'r.created_at DESC';
    const { rows } = await pool.query(
      `SELECT ${REVIEW_COLUMNS}, u.first_name, u.last_name, COUNT(*) OVER()::int AS total_count
         FROM reviews r JOIN users u ON u.id = r.user_id
        WHERE r.hotel_id = $1 AND r.status = 'APPROVED'
        ORDER BY ${orderBy}
        LIMIT $2 OFFSET $3`,
      [hotelId, limit, (page - 1) * limit],
    );
    return { rows, total: rows[0]?.total_count ?? 0 };
  },

  /** Average, count and the five-bucket distribution, approved reviews only. One indexed aggregate query. */
  async aggregateForHotel(hotelId) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count, COALESCE(AVG(rating), 0)::numeric AS average,
              COUNT(*) FILTER (WHERE rating = 5)::int AS r5, COUNT(*) FILTER (WHERE rating = 4)::int AS r4,
              COUNT(*) FILTER (WHERE rating = 3)::int AS r3, COUNT(*) FILTER (WHERE rating = 2)::int AS r2,
              COUNT(*) FILTER (WHERE rating = 1)::int AS r1
         FROM reviews WHERE hotel_id = $1 AND status = 'APPROVED'`,
      [hotelId],
    );
    return rows[0];
  },

  /** Same aggregate for many hotels at once (search results), one query instead of one per hotel. */
  async aggregateForHotels(hotelIds) {
    if (hotelIds.length === 0) return [];
    const { rows } = await pool.query(
      `SELECT hotel_id, COUNT(*)::int AS count, COALESCE(AVG(rating), 0)::numeric AS average
         FROM reviews WHERE hotel_id = ANY($1::bigint[]) AND status = 'APPROVED'
        GROUP BY hotel_id`,
      [hotelIds],
    );
    return rows;
  },

  async listForUser(userId) {
    const { rows } = await pool.query(
      `SELECT ${REVIEW_COLUMNS}, h.name AS hotel_name, h.slug AS hotel_slug, h.city AS hotel_city
         FROM reviews r JOIN hotels h ON h.id = r.hotel_id
        WHERE r.user_id = $1
        ORDER BY r.created_at DESC`,
      [userId],
    );
    return rows;
  },

  /** Admin moderation queue. ADMIN sees everything; a HOTEL_OWNER's view is scoped by hotelIds (see review.service.js). */
  async listForModeration({ page, limit, status, hotelId, q }, hotelIds) {
    const params = [];
    const clauses = [];
    const param = (value) => {
      params.push(value);
      return `$${params.length}`;
    };
    if (status) clauses.push(`r.status = ${param(status)}`);
    if (hotelId) clauses.push(`r.hotel_id = ${param(hotelId)}`);
    if (q) {
      const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      clauses.push(`(r.title ILIKE ${param(pattern)} OR r.body ILIKE ${param(pattern)} OR u.first_name ILIKE ${param(pattern)} OR u.last_name ILIKE ${param(pattern)} OR u.email ILIKE ${param(pattern)})`);
    }
    if (hotelIds != null) {
      params.push(hotelIds);
      clauses.push(`r.hotel_id = ANY($${params.length}::bigint[])`);
    }
    const where = clauses.length > 0 ? clauses.join(' AND ') : 'TRUE';
    params.push(limit, (page - 1) * limit);

    const { rows } = await pool.query(
      `SELECT ${REVIEW_COLUMNS}, u.first_name, u.last_name, u.email::text AS email,
              h.name AS hotel_name, b.booking_ref,
              COUNT(*) OVER()::int AS total_count
         FROM reviews r
         JOIN users u ON u.id = r.user_id
         JOIN hotels h ON h.id = r.hotel_id
         LEFT JOIN bookings b ON b.id = r.booking_id
        WHERE ${where}
        ORDER BY r.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: rows[0]?.total_count ?? 0 };
  },
};
