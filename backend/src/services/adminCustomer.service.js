import { hotelRepository } from '../repositories/hotel.repository.js';
import { adminCustomerRepository } from '../repositories/adminCustomer.repository.js';
import { adminBookingService } from './adminBooking.service.js';
import { reviewService } from './review.service.js';
import { auditService } from './audit.service.js';
import { authRepository } from '../repositories/auth.repository.js';
import { withTransaction } from '../db/pool.js';
import { AppError } from '../utils/AppError.js';
import { toPage } from './presenters.js';
import { toCsv } from '../utils/csv.js';

const EXPORT_CAP = 5000;

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
    isActive: row.is_active,
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
    const [bookings, payments, refunds, reviews] = await Promise.all([
      adminBookingService.list(listArgs, actor),
      adminBookingService.listPayments(listArgs, actor),
      adminBookingService.listRefunds(listArgs, actor),
      reviewService.listMine(customerId),
    ]);
    // A manager sees this customer only because of a booking at one of their own hotels -- their reviews
    // at OTHER hotels are not this manager's business, so the same scope applies here too.
    const scopedReviews = hotelIds == null ? reviews : reviews.filter((review) => hotelIds.includes(review.hotelId));

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
      reviews: scopedReviews,
    };
  },

  /** ADMIN only, enforced by the route — deactivating a guest account is platform-wide, not hotel-scoped. */
  async setStatus(customerId, isActive, actor) {
    const customer = await adminCustomerRepository.findById(customerId);
    if (!customer) throw AppError.notFound('Customer not found');
    if (customer.is_active === isActive) return this.detail(customerId, actor);

    await withTransaction(async (client) => {
      await adminCustomerRepository.setActive(client, customerId, isActive);
      // A deactivated account cannot refresh its session; its current access token still expires naturally (<=15m).
      if (!isActive) await authRepository.revokeAllForUser(client, customerId);
      await auditService.record(client, {
        actor,
        action: isActive ? 'customer.activated' : 'customer.deactivated',
        entity: 'user',
        entityId: customerId,
        oldValue: { isActive: customer.is_active },
        newValue: { isActive },
      });
    });
    return this.detail(customerId, actor);
  },

  /** Same filters and scoping as `list`, just every matching row (up to a safety cap) instead of one page. */
  async exportCustomers(query, actor) {
    const hotelIds = await hotelScopeFor(actor);
    const { rows } = await adminCustomerRepository.list({ ...query, page: 1, limit: EXPORT_CAP }, hotelIds);
    const items = rows.map(toCustomerRow).map((row) => ({ ...row, totalSpendRupees: (row.totalSpendMinor / 100).toFixed(2) }));
    return toCsv(items, [
      { key: 'name', header: 'Customer' }, { key: 'email', header: 'Email' }, { key: 'phone', header: 'Phone' },
      { key: 'bookingsCount', header: 'Bookings' }, { key: 'totalSpendRupees', header: 'Total Spend (INR)' },
      { key: 'lastBookingAt', header: 'Last Booking' }, { key: 'joinedAt', header: 'Joined' },
    ]);
  },
};
