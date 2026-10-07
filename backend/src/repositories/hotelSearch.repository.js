import { pool } from '../db/pool.js';

/**
 * Customer hotel search, as one set-based query. Nothing is loaded into the application and filtered there.
 *
 *   candidate     published hotels that match the destination and hotel-level filters
 *   room_nights   every candidate room type x every requested night, with settings, blocks and reservations
 *   room_ok       room types that have enough free rooms on every night, a valid stay length and fit every room
 *   plan_totals   active rate plans whose stored prices cover every night, summed for the stay
 *   hotel_best    the cheapest bookable option per hotel
 *   listing       one row per hotel, with the price bounds of the unfiltered result set
 *
 * Money is integer minor units throughout. Nothing here relies on client-supplied availability.
 */

const SORT_SQL = {
  recommended: 'guest_rating DESC NULLS LAST, review_count DESC, star_rating DESC NULLS LAST, id ASC',
  price_asc: 'per_night ASC, id ASC',
  price_desc: 'per_night DESC, id ASC',
  guest_rating: 'guest_rating DESC NULLS LAST, review_count DESC, id ASC',
  star_rating: 'star_rating DESC NULLS LAST, guest_rating DESC NULLS LAST, id ASC',
};

export const hotelSearchRepository = {
  async similar({ hotelId, city, limit }) {
    const { rows } = await pool.query(
      `SELECT h.id, h.slug, h.name, h.city, h.area, h.country_code, h.property_type, h.star_rating, h.guest_rating,
              h.review_count, FALSE AS wishlisted,
              (SELECT json_build_object('storageKey', i.storage_key, 'sourceUrl', i.source_url, 'altText', i.alt_text)
                 FROM hotel_images i WHERE i.hotel_id = h.id AND i.deleted_at IS NULL
                ORDER BY i.is_cover DESC, i.sort_order ASC, i.id ASC LIMIT 1) AS cover,
              ARRAY(SELECT a.name FROM hotel_amenities ha JOIN amenities a ON a.id = ha.amenity_id
                     WHERE ha.hotel_id = h.id ORDER BY a.category, a.name LIMIT 4) AS top_amenities
         FROM hotels h
        WHERE h.status = 'PUBLISHED' AND h.deleted_at IS NULL AND h.id <> $1 AND lower(h.city) = lower($2)
        ORDER BY h.guest_rating DESC NULLS LAST, h.star_rating DESC NULLS LAST, h.id
        LIMIT $3`,
      [hotelId, city, limit],
    );
    return rows;
  },

  /**
   * @param {object} q
   *   cities: lowercased city names, or null for any city
   *   areas: lowercased area names, or null
   *   stays: { checkIn, nights: ['YYYY-MM-DD', ...] }
   *   occupancy: [{ adults, childCount }]
   *   filters: { stars, guestRatingMin, propertyTypes, amenities, freeCancellation, mealPlans, minPerNight, maxPerNight }
   *   sort, limit, offset, userId
   */
  async search(q) {
    const nights = q.nights;
    const rooms = q.occupancy.length;
    const adults = q.occupancy.map((room) => room.adults);
    const childCounts = q.occupancy.map((room) => room.childCount);
    const f = q.filters;
    const orderBy = SORT_SQL[q.sort] ?? SORT_SQL.recommended;

    const { rows } = await pool.query(
      `WITH candidate AS (
         SELECT h.id FROM hotels h
          WHERE h.deleted_at IS NULL AND h.status = 'PUBLISHED'
            AND ($1::text[] IS NULL OR lower(h.city) = ANY($1::text[]))
            AND ($2::text[] IS NULL OR lower(h.area) = ANY($2::text[]))
            AND ($3::int[] IS NULL OR h.star_rating = ANY($3::int[]))
            AND ($4::numeric IS NULL OR h.guest_rating >= $4::numeric)
            AND ($5::text[] IS NULL OR h.property_type = ANY($5::text[]))
            AND ($6::text[] IS NULL OR (
                  SELECT COUNT(DISTINCT a.code) FROM hotel_amenities ha JOIN amenities a ON a.id = ha.amenity_id
                   WHERE ha.hotel_id = h.id AND a.code = ANY($6::text[])) = cardinality($6::text[]))
       ),
       room_nights AS (
         SELECT rt.id AS room_type_id, rt.hotel_id, rt.total_units, rt.max_adults, rt.max_children, rt.max_occupancy,
                rt.cancellation_policy_id, n.d AS stay_date, ri.units AS units_override,
                COALESCE(ri.is_closed, FALSE) AS is_closed, ri.min_stay, ri.max_stay,
                COALESCE((SELECT SUM(b.quantity) FROM availability_blocks b
                           WHERE b.room_type_id = rt.id AND b.is_active AND n.d >= b.start_date AND n.d < b.end_date), 0)::int AS blocked,
                COALESCE((SELECT SUM(r.quantity) FROM inventory_reservations r
                           WHERE r.room_type_id = rt.id AND r.stay_date = n.d
                             AND (r.status = 'CONFIRMED' OR (r.status = 'HELD' AND r.expires_at > now()))), 0)::int AS reserved
           FROM room_types rt
           JOIN candidate c ON c.id = rt.hotel_id
           CROSS JOIN UNNEST($7::date[]) AS n(d)
           LEFT JOIN room_inventory ri ON ri.room_type_id = rt.id AND ri.stay_date = n.d
          WHERE rt.status = 'ACTIVE' AND rt.deleted_at IS NULL
       ),
       room_fit AS (
         SELECT room_type_id, hotel_id, max_adults, max_children, max_occupancy, cancellation_policy_id,
                MIN(CASE WHEN is_closed THEN 0 ELSE GREATEST(0, COALESCE(units_override, total_units) - blocked - reserved) END) AS available_rooms,
                BOOL_AND(NOT is_closed) AS open_every_night,
                BOOL_AND(COALESCE(min_stay, 1) <= $8::int AND COALESCE(max_stay, 365) >= $8::int) AS stay_ok
           FROM room_nights
          GROUP BY room_type_id, hotel_id, max_adults, max_children, max_occupancy, cancellation_policy_id
       ),
       room_ok AS (
         SELECT rf.* FROM room_fit rf
          WHERE rf.open_every_night AND rf.stay_ok AND rf.available_rooms >= $9::int
            AND (SELECT BOOL_AND(a >= 1 AND a <= rf.max_adults AND c <= rf.max_children AND a + c <= rf.max_occupancy)
                   FROM UNNEST($10::int[], $11::int[]) AS o(a, c)) IS TRUE
       ),
       plan_totals AS (
         SELECT p.id AS plan_id, ro.room_type_id, ro.hotel_id, ro.available_rooms,
                p.code AS plan_code, p.name AS plan_name, p.meal_plan, p.is_refundable,
                cp.code AS policy_code, cp.name AS policy_name, cp.is_non_refundable,
                cp.cancellation_deadline_hours, cp.refund_percent,
                SUM(rp.base_price_minor) AS base_total, SUM(rp.discount_minor) AS discount_total,
                SUM(rp.tax_minor) AS tax_total, SUM(rp.fee_minor) AS fee_total, SUM(rp.final_price_minor) AS final_total
           FROM room_ok ro
           JOIN rate_plans p ON p.room_type_id = ro.room_type_id AND p.status = 'ACTIVE' AND p.deleted_at IS NULL
           JOIN rate_prices rp ON rp.rate_plan_id = p.id AND rp.stay_date = ANY($7::date[])
           LEFT JOIN cancellation_policies cp ON cp.id = COALESCE(p.cancellation_policy_id, ro.cancellation_policy_id)
          WHERE ($12::text[] IS NULL OR p.meal_plan = ANY($12::text[]))
            AND ($13::boolean IS NOT TRUE OR (p.is_refundable AND NOT cp.is_non_refundable AND cp.refund_percent = 100))
          GROUP BY p.id, ro.room_type_id, ro.hotel_id, ro.available_rooms, p.code, p.name, p.meal_plan, p.is_refundable,
                   cp.code, cp.name, cp.is_non_refundable, cp.cancellation_deadline_hours, cp.refund_percent
         HAVING COUNT(rp.stay_date) = $8::int
       ),
       hotel_best AS (
         SELECT DISTINCT ON (pt.hotel_id) pt.*
           FROM plan_totals pt
          ORDER BY pt.hotel_id, pt.final_total ASC, pt.room_type_id ASC, pt.plan_id ASC
       ),
       listing AS (
         SELECT h.id, h.slug, h.name, h.city, h.area, h.country_code, h.star_rating, h.guest_rating, h.review_count,
                h.property_type,
                hb.room_type_id, rt.name AS room_name, rt.room_code, rt.bed_type, rt.room_size_sqm, rt.view,
                hb.plan_id, hb.plan_code, hb.plan_name, hb.meal_plan, hb.is_refundable,
                hb.policy_code, hb.policy_name, hb.is_non_refundable, hb.cancellation_deadline_hours, hb.refund_percent,
                hb.base_total, hb.discount_total, hb.tax_total, hb.fee_total, hb.final_total,
                hb.available_rooms AS rooms_left,
                ROUND(hb.final_total::numeric / $8::int)::bigint AS per_night,
                (SELECT json_build_object('storageKey', i.storage_key, 'sourceUrl', i.source_url, 'altText', i.alt_text)
                   FROM hotel_images i WHERE i.hotel_id = h.id AND i.deleted_at IS NULL
                  ORDER BY i.is_cover DESC, i.sort_order ASC, i.id ASC LIMIT 1) AS cover,
                ARRAY(SELECT a.name FROM hotel_amenities ha JOIN amenities a ON a.id = ha.amenity_id
                       WHERE ha.hotel_id = h.id ORDER BY a.category, a.name LIMIT 4) AS top_amenities,
                ($14::bigint IS NOT NULL AND EXISTS (SELECT 1 FROM wishlists w WHERE w.user_id = $14::bigint AND w.hotel_id = h.id)) AS wishlisted,
                (SELECT json_build_object('average', ROUND(AVG(r.rating)::numeric, 1), 'count', COUNT(*))
                   FROM reviews r WHERE r.hotel_id = h.id AND r.status = 'APPROVED') AS internal_rating,
                MIN(ROUND(hb.final_total::numeric / $8::int)::bigint) OVER () AS price_floor,
                MAX(ROUND(hb.final_total::numeric / $8::int)::bigint) OVER () AS price_ceiling
           FROM hotel_best hb
           JOIN hotels h ON h.id = hb.hotel_id
           JOIN room_types rt ON rt.id = hb.room_type_id
       ),
       filtered AS (
         SELECT * FROM listing
          WHERE ($15::bigint IS NULL OR per_night >= $15::bigint)
            AND ($16::bigint IS NULL OR per_night <= $16::bigint)
       )
       SELECT f.*, COUNT(*) OVER () AS total_count
         FROM filtered f
        ORDER BY ${orderBy}
        LIMIT $17::int OFFSET $18::int`,
      [
        q.cities,
        q.areas,
        f.stars,
        f.guestRatingMin,
        f.propertyTypes,
        f.amenities,
        nights,
        nights.length,
        rooms,
        adults,
        childCounts,
        f.mealPlans,
        f.freeCancellation === true,
        q.userId ?? null,
        f.minPerNight,
        f.maxPerNight,
        q.limit,
        q.offset,
      ],
    );
    return rows;
  },
};
