import { createLogger } from '../utils/logger.js';

const log = createLogger('notifications');

/** "guest@example.com" -> "g***@example.com". Notification logs never carry full contact details. */
const maskEmail = (email) => (typeof email === 'string' ? email.replace(/^(.).*(@.*)$/, '$1***$2') : null);

/**
 * Log-only driver. It records that a message would have been sent and to whom (masked), and never the
 * message body or payment data. A real email, SMS or WhatsApp provider is plugged in with setDriver().
 */
const logDriver = {
  name: 'log',
  async send({ kind, to, subject, bookingRef }) {
    log.info('notification queued', { kind, channel: 'log', bookingRef, to: maskEmail(to), subject });
  },
};

let driver = logDriver;

export const notificationService = {
  setDriver(next) {
    driver = next;
  },

  /** Sent once, after a payment is verified and the booking is CONFIRMED. */
  async sendBookingConfirmation(booking) {
    await driver.send({
      kind: 'BOOKING_CONFIRMATION',
      to: booking.primary_email ?? booking.primaryContact?.email,
      bookingRef: booking.booking_ref ?? booking.bookingRef,
      subject: `Booking confirmed: ${booking.hotel_name ?? booking.hotel?.name ?? ''}`.trim(),
    });
  },

  /** Sent after a cancellation is recorded. The refund, if any, is reported as its own status. */
  async sendCancellation(booking) {
    await driver.send({
      kind: 'BOOKING_CANCELLED',
      to: booking.primary_email ?? booking.primaryContact?.email,
      bookingRef: booking.booking_ref ?? booking.bookingRef,
      subject: `Booking cancelled: ${booking.booking_ref ?? booking.bookingRef}`,
    });
  },
};
