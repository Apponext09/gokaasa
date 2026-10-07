import { hotelRepository } from '../repositories/hotel.repository.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { adminBookingRepository } from '../repositories/adminBooking.repository.js';
import { bookingService, buildBookingDto } from './booking.service.js';
import { AppError } from '../utils/AppError.js';
import { toPage } from './presenters.js';

/** Resolves to the manager's assigned hotel ids, or null for ADMIN (no scoping at all). */
async function hotelScopeFor(actor) {
  if (actor.roles.includes('ADMIN')) return null;
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
    if (!actor.roles.includes('ADMIN')) {
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
    if (!actor.roles.includes('ADMIN')) {
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
};
