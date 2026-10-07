import { pool } from '../db/pool.js';

const HOLD_COLUMNS = `
  h.id, h.user_id, h.hotel_id, h.room_type_id, h.rate_plan_id, h.check_in::text AS check_in, h.check_out::text AS check_out,
  h.nights, h.rooms, h.occupancy, h.currency, h.subtotal_minor, h.discount_minor, h.taxes_minor, h.fees_minor,
  h.total_minor, h.quote_snapshot, h.guest_details, h.status, h.expires_at, h.booking_id, h.converted_at, h.released_at,
  h.created_at, h.updated_at, (h.expires_at <= now()) AS is_expired_now
`;

const BOOKING_COLUMNS = `
  b.id, b.booking_ref, b.user_id, b.hotel_id, b.hold_id, b.status, b.check_in::text AS check_in, b.check_out::text AS check_out,
  b.adults, b.children, b.rooms_count, b.currency, b.subtotal_minor, b.taxes_minor, b.fees_minor, b.discount_minor,
  b.total_minor, b.paid_minor, b.refunded_minor, b.cancellation_policy, b.cancellation_deadline_at, b.check_in_at,
  b.primary_first_name, b.primary_last_name, b.primary_email::text AS primary_email, b.primary_phone,
  b.gst_number, b.company_name, b.special_request, b.hotel_name, b.hotel_slug, b.hotel_address, b.hotel_city,
  b.hotel_country_code, b.hotel_image_url, b.rate_plan_name, b.meal_plan, b.is_refundable,
  b.cancelled_at, b.cancellation_reason, b.created_at, b.updated_at
`;

export const bookingRepository = {
  /** A published hotel and the facts a quote needs: time zone, check-in time, and cover image. */
  async publishedHotel(hotelId, client = pool) {
    const { rows } = await client.query(
      `SELECT h.id, h.slug, h.name, h.address_line, h.area, h.city, h.country_code, h.time_zone,
              h.check_in_time::text AS check_in_time,
              (SELECT i.storage_key FROM hotel_images i WHERE i.hotel_id = h.id AND i.deleted_at IS NULL
                ORDER BY i.is_cover DESC, i.sort_order ASC, i.id ASC LIMIT 1) AS cover_storage_key
         FROM hotels h
        WHERE h.id = $1 AND h.status = 'PUBLISHED' AND h.deleted_at IS NULL`,
      [hotelId],
    );
    return rows[0] ?? null;
  },

  /** Nightly prices for one plan, in stay order. Used to re-quote under the room lock. */
  async nightlyPrices(ratePlanId, checkIn, checkOut, client = pool) {
    const { rows } = await client.query(
      `SELECT stay_date::text AS stay_date, base_price_minor, discount_minor, tax_minor, fee_minor, final_price_minor
         FROM rate_prices WHERE rate_plan_id = $1 AND stay_date >= $2 AND stay_date < $3 ORDER BY stay_date`,
      [ratePlanId, checkIn, checkOut],
    );
    return rows;
  },

  // ---- holds ----------------------------------------------------------------------------------------------

  /** Locks the hold row. Holds are always locked before their booking, so the two paths cannot deadlock. */
  async lockHold(id, client) {
    const { rows } = await client.query(`SELECT ${HOLD_COLUMNS} FROM booking_holds h WHERE h.id = $1 FOR UPDATE`, [id]);
    return rows[0] ?? null;
  },

  async findHold(id, client = pool) {
    const { rows } = await client.query(`SELECT ${HOLD_COLUMNS} FROM booking_holds h WHERE h.id = $1`, [id]);
    return rows[0] ?? null;
  },

  /** The guest's most recent hold that is still HELD and not yet expired (used to resume after a refresh). */
  async activeHoldForUser(userId, client = pool) {
    const { rows } = await client.query(
      `SELECT ${HOLD_COLUMNS} FROM booking_holds h
        WHERE h.user_id = $1 AND h.status = 'HELD' AND h.expires_at > now() AND h.booking_id IS NULL
        ORDER BY h.created_at DESC LIMIT 1`,
      [userId],
    );
    return rows[0] ?? null;
  },

  async insertHold(client, values) {
    const { rows } = await client.query(
      `INSERT INTO booking_holds (user_id, hotel_id, room_type_id, rate_plan_id, check_in, check_out, nights, rooms,
                                  occupancy, currency, subtotal_minor, discount_minor, taxes_minor, fees_minor, total_minor,
                                  quote_snapshot, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'HELD', now() + ($17 || ' minutes')::interval)
       RETURNING id, expires_at`,
      [
        values.userId, values.hotelId, values.roomTypeId, values.ratePlanId, values.checkIn, values.checkOut,
        values.nights, values.rooms, JSON.stringify(values.occupancy), values.currency, values.subtotal,
        values.discount, values.taxes, values.fees, values.total, JSON.stringify(values.quoteSnapshot),
        String(values.holdMinutes),
      ],
    );
    return rows[0];
  },

  /** Replaces the priced components after a re-quote. Expiry and reservations are unchanged. */
  async updateHoldQuote(client, id, values) {
    await client.query(
      `UPDATE booking_holds SET subtotal_minor = $2, discount_minor = $3, taxes_minor = $4, fees_minor = $5,
              total_minor = $6, quote_snapshot = $7, updated_at = now()
        WHERE id = $1`,
      [id, values.subtotal, values.discount, values.taxes, values.fees, values.total, JSON.stringify(values.quoteSnapshot)],
    );
  },

  async saveHoldGuests(client, id, guestDetails) {
    await client.query(`UPDATE booking_holds SET guest_details = $2, updated_at = now() WHERE id = $1`, [
      id,
      JSON.stringify(guestDetails),
    ]);
  },

  async setHoldStatus(client, id, status) {
    await client.query(
      `UPDATE booking_holds
          SET status = $2,
              converted_at = CASE WHEN $2 = 'CONVERTED' THEN now() ELSE converted_at END,
              released_at = CASE WHEN $2 IN ('RELEASED', 'EXPIRED') THEN now() ELSE released_at END,
              updated_at = now()
        WHERE id = $1`,
      [id, status],
    );
  },

  async linkHoldToBooking(client, holdId, bookingId) {
    await client.query(`UPDATE booking_holds SET booking_id = $2, updated_at = now() WHERE id = $1`, [holdId, bookingId]);
  },

  /** HELD holds past their expiry, locked so two workers never expire the same hold. */
  async dueHoldIds(client, limit) {
    const { rows } = await client.query(
      `SELECT id FROM booking_holds WHERE status = 'HELD' AND expires_at <= now()
        ORDER BY expires_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [limit],
    );
    return rows.map((row) => row.id);
  },

  /** Moves a hold's reservations to their final status (CONFIRMED on conversion, RELEASED otherwise). */
  async setReservationsForHold(client, holdId, status, bookingId = null) {
    await client.query(
      `UPDATE inventory_reservations SET status = $2, booking_id = COALESCE($3, booking_id), updated_at = now()
        WHERE hold_id = $1 AND status = 'HELD'`,
      [holdId, status, bookingId],
    );
  },

  // ---- bookings -------------------------------------------------------------------------------------------

  async nextBookingSequence(client) {
    const { rows } = await client.query(`SELECT nextval('booking_ref_seq')::bigint AS seq`);
    return Number(rows[0].seq);
  },

  async insertBooking(client, values) {
    const columns = Object.keys(values);
    const { rows } = await client.query(
      `INSERT INTO bookings (${columns.join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING id`,
      Object.values(values),
    );
    return rows[0].id;
  },

  async insertBookingRoom(client, values) {
    await client.query(
      `INSERT INTO booking_rooms (booking_id, room_type_id, room_name, meal_plan, rate_plan_id, rate_plan_name,
                                  quantity, nights, rate_per_night_minor, subtotal_minor, discount_minor, taxes_minor,
                                  fees_minor, total_minor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        values.bookingId, values.roomTypeId, values.roomName, values.mealPlan, values.ratePlanId, values.ratePlanName,
        values.quantity, values.nights, values.ratePerNight, values.subtotal, values.discount, values.taxes, values.fees,
        values.total,
      ],
    );
  },

  async insertBookingGuest(client, values) {
    await client.query(
      `INSERT INTO booking_guests (booking_id, room_index, full_name, first_name, last_name, age, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [values.bookingId, values.roomIndex, values.fullName, values.firstName, values.lastName, values.age, values.isPrimary],
    );
  },

  /** Locks the booking row. Always taken after the hold lock. */
  async lockBooking(id, client) {
    const { rows } = await client.query(`SELECT ${BOOKING_COLUMNS} FROM bookings b WHERE b.id = $1 FOR UPDATE`, [id]);
    return rows[0] ?? null;
  },

  async findBooking(id, client = pool) {
    const { rows } = await client.query(`SELECT ${BOOKING_COLUMNS} FROM bookings b WHERE b.id = $1`, [id]);
    return rows[0] ?? null;
  },

  async findBookingByHold(holdId, client = pool) {
    const { rows } = await client.query(`SELECT ${BOOKING_COLUMNS} FROM bookings b WHERE b.hold_id = $1`, [holdId]);
    return rows[0] ?? null;
  },

  /** Sets status and any extra columns. The caller has already checked the transition. */
  async setBookingStatus(client, id, status, extra = {}) {
    const columns = Object.keys(extra);
    const sets = [`status = $2`, `updated_at = now()`, ...columns.map((c, i) => `${c} = $${i + 3}`)];
    await client.query(`UPDATE bookings SET ${sets.join(', ')} WHERE id = $1`, [id, status, ...Object.values(extra)]);
  },

  async bookingRooms(bookingId, client = pool) {
    const { rows } = await client.query(
      `SELECT room_type_id, room_name, meal_plan, rate_plan_name, quantity, nights, rate_per_night_minor,
              subtotal_minor, discount_minor, taxes_minor, fees_minor, total_minor
         FROM booking_rooms WHERE booking_id = $1 ORDER BY id`,
      [bookingId],
    );
    return rows;
  },

  async bookingGuests(bookingId, client = pool) {
    const { rows } = await client.query(
      `SELECT room_index, first_name, last_name, full_name, age, is_primary
         FROM booking_guests WHERE booking_id = $1 ORDER BY room_index, id`,
      [bookingId],
    );
    return rows;
  },

  /**
   * Tabs for My Trips. "Upcoming" is confirmed stays that have not checked out in the hotel's local time;
   * "Completed" is confirmed stays that have; "Cancelled" is anything cancelled or refunded.
   */
  async listForUser(userId, tab, today, client = pool) {
    const filter = {
      upcoming: `b.status = 'CONFIRMED' AND b.check_out >= $2::date`,
      completed: `b.status = 'CONFIRMED' AND b.check_out < $2::date`,
      cancelled: `b.status IN ('CANCELLED', 'REFUND_PENDING', 'REFUNDED') AND $2::date IS NOT NULL`,
    }[tab];
    const { rows } = await client.query(
      `SELECT ${BOOKING_COLUMNS} FROM bookings b
        WHERE b.user_id = $1 AND ${filter}
        ORDER BY b.check_in ASC, b.id ASC`,
      [userId, today],
    );
    return rows;
  },

  async releaseReservationsForBooking(client, bookingId) {
    await client.query(
      `UPDATE inventory_reservations SET status = 'RELEASED', updated_at = now()
        WHERE booking_id = $1 AND status = 'CONFIRMED'`,
      [bookingId],
    );
  },

  /** How many bookings are in each status. Used for public counts (e.g. "confirmed stays"), never revenue. */
  async countByStatus(client = pool) {
    const { rows } = await client.query(`SELECT status, COUNT(*)::int AS count FROM bookings GROUP BY status`);
    return Object.fromEntries(rows.map((row) => [row.status, row.count]));
  },
};
