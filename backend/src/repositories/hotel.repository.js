import { pool } from '../db/pool.js';

const SORT_OPTIONS = {
  updated_desc: 'h.updated_at DESC',
  name_asc: 'h.name ASC',
  rating_desc: 'h.guest_rating DESC NULLS LAST',
  star_desc: 'h.star_rating DESC NULLS LAST',
  created_desc: 'h.created_at DESC',
};

/** Columns returned for every hotel. Keep this list explicit so new columns are opted into. */
const HOTEL_COLUMNS = `
  h.id, h.slug, h.name, h.short_name, h.description, h.property_type, h.star_rating,
  h.guest_rating, h.review_count, h.address_line, h.area, h.city, h.state, h.country_code,
  h.postal_code, h.latitude, h.longitude, h.phone, h.email::text AS email, h.website,
  h.check_in_time, h.check_out_time, h.time_zone, h.status, h.external_provider, h.external_id,
  h.published_at, h.archived_at, h.created_by, h.updated_by, h.created_at, h.updated_at,
  (SELECT COUNT(*)::int FROM room_types rt WHERE rt.hotel_id = h.id AND rt.deleted_at IS NULL AND rt.status <> 'ARCHIVED') AS room_type_count,
  (SELECT i.id FROM hotel_images i WHERE i.hotel_id = h.id AND i.deleted_at IS NULL
     ORDER BY i.is_cover DESC, i.sort_order ASC, i.id ASC LIMIT 1) AS cover_image_id
`;

const escapeLike = (value) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

function buildFilters(filters, { publicOnly, managerUserId }) {
  const clauses = ['h.deleted_at IS NULL'];
  const params = [];
  const param = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (publicOnly) {
    clauses.push(`h.status = 'PUBLISHED'`);
  } else if (filters.status) {
    clauses.push(`h.status = ${param(filters.status)}`);
  }
  if (managerUserId != null) {
    clauses.push(`EXISTS (SELECT 1 FROM hotel_managers hm WHERE hm.hotel_id = h.id AND hm.user_id = ${param(managerUserId)})`);
  }
  // Separate from managerUserId above: that's the viewer's OWN scoping, this is an arbitrary admin-chosen filter.
  if (filters.managerId) {
    clauses.push(`EXISTS (SELECT 1 FROM hotel_managers hm WHERE hm.hotel_id = h.id AND hm.user_id = ${param(filters.managerId)})`);
  }
  if (filters.q) {
    const pattern = param(`%${escapeLike(filters.q)}%`);
    clauses.push(`(h.name ILIKE ${pattern} OR h.city ILIKE ${pattern})`);
  }
  if (filters.city) clauses.push(`lower(h.city) = lower(${param(filters.city)})`);
  if (filters.countryCode) clauses.push(`h.country_code = ${param(filters.countryCode)}`);
  if (filters.starRating) clauses.push(`h.star_rating = ${param(filters.starRating)}`);
  if (filters.propertyType) clauses.push(`h.property_type = ${param(filters.propertyType)}`);

  return { where: clauses.join(' AND '), params };
}

export const hotelRepository = {
  async list(filters, { publicOnly = false, managerUserId = null } = {}) {
    const { where, params } = buildFilters(filters, { publicOnly, managerUserId });
    const orderBy = SORT_OPTIONS[filters.sort] ?? SORT_OPTIONS.updated_desc;
    const limit = filters.limit;
    const offset = (filters.page - 1) * filters.limit;

    const { rows } = await pool.query(
      `SELECT ${HOTEL_COLUMNS}, COUNT(*) OVER()::int AS total_count
         FROM hotels h
        WHERE ${where}
        ORDER BY ${orderBy}, h.id ASC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    return { rows, total: rows[0]?.total_count ?? 0 };
  },

  async findById(id, { client = pool, publicOnly = false } = {}) {
    const numeric = /^\d+$/.test(String(id));
    const { rows } = await client.query(
      `SELECT ${HOTEL_COLUMNS}
         FROM hotels h
        WHERE ${numeric ? 'h.id = $1' : 'h.slug = $1'}
          AND h.deleted_at IS NULL
          ${publicOnly ? `AND h.status = 'PUBLISHED'` : ''}`,
      [numeric ? Number(id) : String(id)],
    );
    return rows[0] ?? null;
  },

  async findByExternal(provider, externalId, client = pool) {
    const { rows } = await client.query(
      `SELECT id, slug, name, status FROM hotels
        WHERE external_provider = $1 AND external_id = $2 AND deleted_at IS NULL`,
      [provider, externalId],
    );
    return rows[0] ?? null;
  },

  async slugTaken(slug, client = pool) {
    const { rowCount } = await client.query(`SELECT 1 FROM hotels WHERE slug = $1`, [slug]);
    return rowCount > 0;
  },

  async insert(client, values) {
    const columns = Object.keys(values);
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const { rows } = await client.query(
      `INSERT INTO hotels (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
      Object.values(values),
    );
    return rows[0].id;
  },

  async update(client, id, changes) {
    const columns = Object.keys(changes);
    if (columns.length === 0) return;
    const assignments = columns.map((column, index) => `${column} = $${index + 2}`);
    await client.query(
      `UPDATE hotels SET ${assignments.join(', ')}, updated_at = now() WHERE id = $1`,
      [id, ...Object.values(changes)],
    );
  },

  async findAmenityIdsByCodes(client, codes) {
    if (codes.length === 0) return [];
    const { rows } = await client.query(`SELECT id, code FROM amenities WHERE code = ANY($1::text[])`, [codes]);
    return rows;
  },

  async replaceAmenities(client, hotelId, amenityIds) {
    await client.query(`DELETE FROM hotel_amenities WHERE hotel_id = $1`, [hotelId]);
    if (amenityIds.length === 0) return;
    await client.query(
      `INSERT INTO hotel_amenities (hotel_id, amenity_id)
       SELECT $1, UNNEST($2::smallint[])`,
      [hotelId, amenityIds],
    );
  },

  async listAmenities(hotelId, client = pool) {
    const { rows } = await client.query(
      `SELECT a.code, a.name, a.category
         FROM hotel_amenities ha
         JOIN amenities a ON a.id = ha.amenity_id
        WHERE ha.hotel_id = $1
        ORDER BY a.category, a.name`,
      [hotelId],
    );
    return rows;
  },

  async listImages(hotelId, client = pool) {
    const { rows } = await client.query(
      `SELECT id, category, source_url, source_provider, storage_key, alt_text, width, height, sort_order, is_cover,
              origin, mime_type, byte_size
         FROM hotel_images
        WHERE hotel_id = $1 AND deleted_at IS NULL
        ORDER BY is_cover DESC, sort_order ASC, id ASC`,
      [hotelId],
    );
    return rows;
  },

  async insertImages(client, hotelId, images) {
    for (const image of images) {
      await client.query(
        `INSERT INTO hotel_images (hotel_id, category, source_url, source_provider, alt_text, sort_order, is_cover)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          hotelId,
          image.category,
          image.sourceUrl,
          image.sourceProvider ?? null,
          image.altText ?? null,
          image.sortOrder,
          image.isCover ?? false,
        ],
      );
    }
  },

  async setStatus(client, id, status, { publishedAt, archivedAt, userId }) {
    await client.query(
      `UPDATE hotels
          SET status = $2,
              published_at = COALESCE($3::timestamptz, published_at),
              archived_at = $4::timestamptz,
              updated_by = $5,
              updated_at = now()
        WHERE id = $1`,
      [id, status, publishedAt ?? null, archivedAt ?? null, userId],
    );
  },

  async countByStatus(client = pool, managerUserId = null) {
    const params = [];
    let filter = '';
    if (managerUserId != null) {
      params.push(managerUserId);
      filter = `AND EXISTS (SELECT 1 FROM hotel_managers hm WHERE hm.hotel_id = h.id AND hm.user_id = $${params.length})`;
    }
    const { rows } = await client.query(
      `SELECT h.status, COUNT(*)::int AS count FROM hotels h WHERE h.deleted_at IS NULL ${filter} GROUP BY h.status`,
      params,
    );
    return Object.fromEntries(rows.map((row) => [row.status, row.count]));
  },

  /** Hotel ids a HOTEL_MANAGER is assigned to. Used to scope bookings/payments/customers to "my hotels". */
  async managedHotelIds(userId, client = pool) {
    const { rows } = await client.query(`SELECT hotel_id FROM hotel_managers WHERE user_id = $1`, [userId]);
    return rows.map((row) => row.hotel_id);
  },
};
