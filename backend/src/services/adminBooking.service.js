import { hotelRepository } from '../repositories/hotel.repository.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { adminBookingRepository } from '../repositories/adminBooking.repository.js';
import { bookingService, buildBookingDto } from './booking.service.js';
import { AppError } from '../utils/AppError.js';
import { toPage } from './presenters.js';
import { toCsv } from '../utils/csv.js';

const EXPORT_CAP = 5000;
const rupees = (minor) => (Number(minor) / 100).toFixed(2);

/** Resolves to the manager's assigned hotel ids, or null for ADMIN (no scoping at all). */
async function hotelScopeFor(actor) {
  if (actor.roles.includes('ADMIN') || actor.roles.includes('SALES_EXECUTIVE')) return null;
  return hotelRepository.managedHotelIds(actor.id);
}

function toBookingRow(row) {
  return {
    id: row.id,
    bookingRef: row.booking_ref,
    status: row.status,
    paymentStatus: row.payment_status,
    hotel: { id: row.hotel_id, name: row.hotel_name, city: row.hotel_city },
    customer: { name: [row.primary_first_name, row.primary_last_name].filter(Boolean).join(' '), email: row.primary_email },
    checkIn: row.check_in,
    checkOut: row.check_out,
    rooms: row.rooms_count,
    amounts: { total: Number(row.total_minor), paid: Number(row.paid_minor), refunded: Number(row.refunded_minor), currency: row.currency },
    createdAt: row.created_at,
  };
}

function toPaymentRow(row) {
  return {
    id: row.id,
    bookingId: row.booking_id,
    bookingRef: row.booking_ref,
    hotelName: row.hotel_name,
    customer: { name: [row.primary_first_name, row.primary_last_name].filter(Boolean).join(' '), email: row.primary_email },
    orderId: row.provider_order_id,
    paymentId: row.provider_payment_id,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    status: row.status,
    mode: row.gateway_mode,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  };
}

function toRefundRow(row) {
  return {
    id: row.id,
    bookingId: row.booking_id,
    bookingRef: row.booking_ref,
    hotelName: row.hotel_name,
    customer: { name: [row.primary_first_name, row.primary_last_name].filter(Boolean).join(' '), email: row.primary_email },
    paymentId: row.payment_id,
    amountMinor: Number(row.amount_minor),
    reason: row.reason,
    status: row.status,
    providerRefundId: row.provider_refund_id,
    createdAt: row.created_at,
    processedAt: row.processed_at,
  };
}

export const adminBookingService = {
  async list(query, actor) {
    const hotelIds = await hotelScopeFor(actor);
    const { rows, total } = await adminBookingRepository.list(query, hotelIds);
    return toPage(rows.map(toBookingRow), total, query.page, query.limit);
  },

  /** Full booking detail, same DTO as the customer-facing one, scoped to the manager's hotels. */
  async detail(bookingId, actor) {
    const booking = await bookingRepository.findBooking(bookingId);
    if (!booking) throw AppError.notFound('Booking not found');
    if (!actor.roles.some((role) => ['ADMIN', 'SALES_EXECUTIVE'].includes(role))) {
      const hotelIds = await hotelScopeFor(actor);
      if (!hotelIds.includes(booking.hotel_id)) throw AppError.notFound('Booking not found');
    }
    return buildBookingDto(null, booking);
  },

  /**
   * Staff-initiated cancellation. A HOTEL_MANAGER may cancel a booking at one of its own hotels; ADMIN
   * may cancel any booking. Reuses the exact same refund logic the guest's own cancel uses.
   */
  async cancel(bookingId, body, actor) {
    const booking = await bookingRepository.findBooking(bookingId);
    if (!booking) throw AppError.notFound('Booking not found');
    if (!actor.roles.some((role) => ['ADMIN', 'SALES_EXECUTIVE'].includes(role))) {
      const hotelIds = await hotelScopeFor(actor);
      if (!hotelIds.includes(booking.hotel_id)) throw AppError.notFound('Booking not found');
    }
    return bookingService.cancelAsAdmin(bookingId, body, actor);
  },

  async listPayments(query, actor) {
    const hotelIds = await hotelScopeFor(actor);
    const { rows, total } = await adminBookingRepository.listPayments(query, hotelIds);
    return toPage(rows.map(toPaymentRow), total, query.page, query.limit);
  },

  async listRefunds(query, actor) {
    const hotelIds = await hotelScopeFor(actor);
    const { rows, total } = await adminBookingRepository.listRefunds(query, hotelIds);
    return toPage(rows.map(toRefundRow), total, query.page, query.limit);
  },

  /** Same filters and scoping as `list`, just every matching row (up to a safety cap) instead of one page. */
  async exportBookings(query, actor) {
    const hotelIds = await hotelScopeFor(actor);
    const { rows } = await adminBookingRepository.list({ ...query, page: 1, limit: EXPORT_CAP }, hotelIds);
    const items = rows.map(toBookingRow).map((row) => ({
      ...row,
      amounts: { ...row.amounts, totalRupees: rupees(row.amounts.total), paidRupees: rupees(row.amounts.paid), refundedRupees: rupees(row.amounts.refunded) },
    }));
    return toCsv(items, [
      { key: 'bookingRef', header: 'Booking Ref' }, { key: 'status', header: 'Status' }, { key: 'paymentStatus', header: 'Payment Status' },
      { key: 'hotel.name', header: 'Hotel' }, { key: 'hotel.city', header: 'City' },
      { key: 'customer.name', header: 'Customer' }, { key: 'customer.email', header: 'Email' },
      { key: 'checkIn', header: 'Check-in' }, { key: 'checkOut', header: 'Check-out' }, { key: 'rooms', header: 'Rooms' },
      { key: 'amounts.totalRupees', header: 'Total (INR)' }, { key: 'amounts.paidRupees', header: 'Paid' }, { key: 'amounts.refundedRupees', header: 'Refunded' },
      { key: 'createdAt', header: 'Created' },
    ]);
  },

  async exportPayments(query, actor) {
    const hotelIds = await hotelScopeFor(actor);
    const { rows } = await adminBookingRepository.listPayments({ ...query, page: 1, limit: EXPORT_CAP }, hotelIds);
    const items = rows.map(toPaymentRow).map((row) => ({ ...row, amountRupees: rupees(row.amountMinor) }));
    return toCsv(items, [
      { key: 'bookingRef', header: 'Booking Ref' }, { key: 'hotelName', header: 'Hotel' },
      { key: 'customer.name', header: 'Customer' }, { key: 'customer.email', header: 'Email' },
      { key: 'orderId', header: 'Order ID' }, { key: 'paymentId', header: 'Payment ID' },
      { key: 'amountRupees', header: `Amount (${items[0]?.currency ?? 'INR'})` }, { key: 'status', header: 'Status' }, { key: 'mode', header: 'Mode' },
      { key: 'createdAt', header: 'Created' }, { key: 'paidAt', header: 'Paid At' },
    ]);
  },

  async exportRefunds(query, actor) {
    const hotelIds = await hotelScopeFor(actor);
    const { rows } = await adminBookingRepository.listRefunds({ ...query, page: 1, limit: EXPORT_CAP }, hotelIds);
    const items = rows.map(toRefundRow).map((row) => ({ ...row, amountRupees: rupees(row.amountMinor) }));
    return toCsv(items, [
      { key: 'bookingRef', header: 'Booking Ref' }, { key: 'hotelName', header: 'Hotel' },
      { key: 'customer.name', header: 'Customer' }, { key: 'customer.email', header: 'Email' },
      { key: 'paymentId', header: 'Payment ID' }, { key: 'amountRupees', header: 'Amount (INR)' },
      { key: 'reason', header: 'Reason' }, { key: 'status', header: 'Status' }, { key: 'providerRefundId', header: 'Refund Reference' },
      { key: 'createdAt', header: 'Created' }, { key: 'processedAt', header: 'Processed At' },
    ]);
  },
};
