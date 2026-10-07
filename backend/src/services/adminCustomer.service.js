import { hotelRepository } from '../repositories/hotel.repository.js';
import { adminCustomerRepository } from '../repositories/adminCustomer.repository.js';
import { adminBookingService } from './adminBooking.service.js';
import { AppError } from '../utils/AppError.js';
import { toPage } from './presenters.js';

async function hotelScopeFor(actor) {
  if (actor.roles.includes('ADMIN')) return null;
  return hotelRepository.managedHotelIds(actor.id);
}

function toCustomerRow(row) {
  return {
    id: row.id,
    name: [row.first_name, row.last_name].filter(Boolean).join(' '),
    email: row.email,
    phone: row.phone,
    bookingsCount: row.bookings_count,
    totalSpendMinor: Number(row.total_spend_minor),
    lastBookingAt: row.last_booking_at,
    joinedAt: row.created_at,
  };
}

export const adminCustomerService = {
  async list(query, actor) {
    const hotelIds = await hotelScopeFor(actor);
    const { rows, total } = await adminCustomerRepository.list(query, hotelIds);
    return toPage(rows.map(toCustomerRow), total, query.page, query.limit);
  },

  /**
   * Profile plus bookings/payments/refunds. Never returns a password hash or any token. Reuses
   * adminBookingService's own list methods (customer-scoped) rather than re-querying bookings here.
   */
  async detail(customerId, actor) {
    const customer = await adminCustomerRepository.findById(customerId);
    if (!customer) throw AppError.notFound('Customer not found');

    const hotelIds = await hotelScopeFor(actor);
    if (hotelIds != null) {
      const visible = await adminCustomerRepository.hasBookingAtHotels(customerId, hotelIds);
      if (!visible) throw AppError.notFound('Customer not found');
    }

    const listArgs = { customerId, page: 1, limit: 50, sort: 'created_desc' };
    const [bookings, payments, refunds] = await Promise.all([
      adminBookingService.list(listArgs, actor),
      adminBookingService.listPayments(listArgs, actor),
      adminBookingService.listRefunds(listArgs, actor),
    ]);

    return {
      id: customer.id,
      name: [customer.first_name, customer.last_name].filter(Boolean).join(' '),
      email: customer.email,
      phone: customer.phone,
      isActive: customer.is_active,
      joinedAt: customer.created_at,
      bookings: bookings.items,
      payments: payments.items,
      refunds: refunds.items,
    };
  },
};
