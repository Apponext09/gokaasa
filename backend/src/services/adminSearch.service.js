import { hotelRepository } from '../repositories/hotel.repository.js';
import { adminBookingRepository } from '../repositories/adminBooking.repository.js';
import { adminCustomerRepository } from '../repositories/adminCustomer.repository.js';

const PER_TYPE_LIMIT = 5;

/** `null` for ADMIN (no scoping); a manager's (possibly empty) hotel ids otherwise. */
async function hotelIdsFor(actor) {
  if (actor.roles.includes('ADMIN')) return null;
  const ids = await hotelRepository.managedHotelIds(actor.id);
  // A manager with zero assigned hotels gets honestly-empty results, never another manager's data.
  return ids.length === 0 ? [-1] : ids;
}

/**
 * The command palette's backing endpoint: one `q`, fanned out to the three list queries the hotel,
 * booking and customer admin pages already use (same ILIKE columns, same hotel-manager scoping) --
 * nothing here is a new query shape, just a merge of three existing, already-scoped ones.
 */
export const adminSearchService = {
  async search(q, actor) {
    const hotelIds = await hotelIdsFor(actor);
    const managerUserId = actor.roles.includes('ADMIN') ? null : actor.id;

    const [hotels, bookings, customers] = await Promise.all([
      hotelRepository.list({ q, page: 1, limit: PER_TYPE_LIMIT, sort: 'updated_desc' }, { managerUserId }),
      adminBookingRepository.list({ q, page: 1, limit: PER_TYPE_LIMIT, sort: 'created_desc' }, hotelIds),
      adminCustomerRepository.list({ q, page: 1, limit: PER_TYPE_LIMIT }, hotelIds),
    ]);

    return {
      items: [
        ...hotels.rows.map((row) => ({
          type: 'hotel', id: row.id, title: row.name, subtitle: [row.area, row.city].filter(Boolean).join(', '),
          status: row.status, href: `/admin/hotels/${row.id}`,
        })),
        ...bookings.rows.map((row) => ({
          type: 'booking', id: row.id, title: row.booking_ref,
          subtitle: `${[row.primary_first_name, row.primary_last_name].filter(Boolean).join(' ')} · ${row.hotel_name}`,
          status: row.status, href: `/admin/bookings/${row.id}`,
        })),
        ...customers.rows.map((row) => ({
          type: 'customer', id: row.id, title: [row.first_name, row.last_name].filter(Boolean).join(' '),
          subtitle: row.email, status: null, href: `/admin/customers/${row.id}`,
        })),
      ],
    };
  },
};
