import { pool } from '../db/pool.js';

const ROOM_COLUMNS = `
  rt.id, rt.hotel_id, rt.room_code, rt.name, rt.category, rt.description, rt.max_adults, rt.max_children,
  rt.max_occupancy, rt.bed_type, rt.bed_count, rt.room_size_sqm, rt.view, rt.smoking, rt.total_units,
  rt.cancellation_policy_id, rt.status, rt.archived_at, rt.created_at, rt.updated_at
`;

export const roomTypeRepository = {
  /** Room types for a hotel, with the lowest upcoming nightly price and image count for list screens. */
  async listForHotel(hotelId, { includeArchived = false, publicOnly = false } = {}, client = pool) {
    const statusFilter = publicOnly
      ? `rt.status = 'ACTIVE'`
      : includeArchived
        ? 'TRUE'
        : `rt.status <> 'ARCHIVED'`;
    const { rows } = await client.query(
      `SELECT ${ROOM_COLUMNS},
              (SELECT MIN(
                        p.base_price_minor
                        - ROUND(p.base_price_minor * p.discount_percent / 100)::bigint
                        + ROUND((p.base_price_minor - ROUND(p.base_price_minor * p.discount_percent / 100)::bigint) * p.tax_percent / 100)::bigint
                        + p.fee_minor
                      )
                 FROM rate_plans p
                WHERE p.room_type_id = rt.id AND p.deleted_at IS NULL AND p.status = 'ACTIVE'
                  AND p.base_price_minor IS NOT NULL) AS from_price_minor,
              (SELECT COUNT(*)::int FROM room_images ri WHERE ri.room_type_id = rt.id AND ri.deleted_at IS NULL) AS image_count
         FROM room_types rt
        WHERE rt.hotel_id = $1 AND rt.deleted_at IS NULL AND ${statusFilter}
        ORDER BY rt.status = 'ACTIVE' DESC, rt.total_units DESC, rt.name ASC`,
      [hotelId],
    );
    return rows;
  },

  async findById(id, client = pool) {
    const { rows } = await client.query(
      `SELECT ${ROOM_COLUMNS} FROM room_types rt WHERE rt.id = $1 AND rt.deleted_at IS NULL`,
      [id],
    );
    return rows[0] ?? null;
  },

  /** Returns the locked row. Every change to a room's stock or price takes this lock first. */
  async lockById(id, client) {
    const { rows } = await client.query(
      `SELECT id, hotel_id, status, total_units FROM room_types WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );
    return rows[0] ?? null;
  },

  async existsCode(hotelId, code, exceptId, client = pool) {
    const { rowCount } = await client.query(
      `SELECT 1 FROM room_types WHERE hotel_id = $1 AND room_code = $2 AND deleted_at IS NULL AND ($3::bigint IS NULL OR id <> $3)`,
      [hotelId, code, exceptId ?? null],
    );
    return rowCount > 0;
  },

  async lockHotelForCode(hotelId, client) {
    await client.query(`SELECT id FROM hotels WHERE id = $1 FOR UPDATE`, [hotelId]);
  },

  async nextGeneratedCode(hotelId, client = pool) {
    const { rows } = await client.query(
      `SELECT COALESCE(MAX(substring(room_code FROM '^RM_([0-9]+)$')::integer), 0) + 1 AS next_number
         FROM room_types
        WHERE hotel_id = $1`,
      [hotelId],
    );
    return `RM_${String(rows[0].next_number).padStart(2, '0')}`;
  },

  async existsName(hotelId, name, exceptId, client = pool) {
    const { rowCount } = await client.query(
      `SELECT 1 FROM room_types WHERE hotel_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL AND ($3::bigint IS NULL OR id <> $3)`,
      [hotelId, name, exceptId ?? null],
    );
    return rowCount > 0;
  },

  async insert(client, values) {
    const columns = Object.keys(values);
    const { rows } = await client.query(
      `INSERT INTO room_types (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      Object.values(values),
    );
    return rows[0].id;
  },

  async update(client, id, changes) {
    const columns = Object.keys(changes);
    if (columns.length === 0) return;
    await client.query(
      `UPDATE room_types SET ${columns.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`,
      [id, ...Object.values(changes)],
    );
  },

  async archive(client, id) {
    await client.query(
      `UPDATE room_types SET status = 'ARCHIVED', archived_at = now(), updated_at = now() WHERE id = $1`,
      [id],
    );
  },

  async listAmenities(roomTypeId, client = pool) {
    const { rows } = await client.query(
      `SELECT a.code, a.name, a.category FROM room_amenities ra JOIN amenities a ON a.id = ra.amenity_id
        WHERE ra.room_type_id = $1 ORDER BY a.category, a.name`,
      [roomTypeId],
    );
    return rows;
  },

  async replaceAmenities(client, roomTypeId, amenityIds) {
    await client.query(`DELETE FROM room_amenities WHERE room_type_id = $1`, [roomTypeId]);
    if (amenityIds.length === 0) return;
    await client.query(
      `INSERT INTO room_amenities (room_type_id, amenity_id) SELECT $1, UNNEST($2::smallint[])`,
      [roomTypeId, amenityIds],
    );
  },

  async listImages(roomTypeId, client = pool) {
    const { rows } = await client.query(
      `SELECT id, room_type_id, storage_key, alt_text, mime_type, byte_size, sort_order, is_cover
         FROM room_images WHERE room_type_id = $1 AND deleted_at IS NULL
        ORDER BY is_cover DESC, sort_order ASC, id ASC`,
      [roomTypeId],
    );
    return rows;
  },

  async findImage(roomTypeId, imageId, client = pool) {
    const { rows } = await client.query(
      `SELECT id, room_type_id, storage_key, is_cover FROM room_images WHERE id = $1 AND room_type_id = $2 AND deleted_at IS NULL`,
      [imageId, roomTypeId],
    );
    return rows[0] ?? null;
  },
};
