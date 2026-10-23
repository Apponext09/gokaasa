import { pool } from '../db/pool.js';
import { notificationService as persistedNotifications } from '../services/notification.service.js';
import { mailService } from '../services/mail.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('notifications');

/** "guest@example.com" -> "g***@example.com". Logs never carry a full address. */
const maskEmail = (email) => (typeof email === 'string' ? email.replace(/^(.).*(@.*)$/, '$1***$2') : null);
const rupees = (minor) => `₹${(Number(minor) / 100).toLocaleString('en-IN')}`;

/**
 * Persists one in-app notification (for the bell) and, where a `mail` is given, sends a real email through
 * the existing SMTP-capable mailService -- which itself already falls back to logging, never a real send,
 * when no SMTP host is configured. Both steps are best-effort: a notification failing to send or persist
 * never undoes the business event that triggered it, so every call site stays fire-and-forget.
 */
async function notify({ userId, type, title, message, entityType = null, entityId = null }, mail) {
  try {
    await persistedNotifications.create(pool, { userId, type, title, message, entityType, entityId });
  } catch (error) {
    log.error('failed to persist notification', { message: error.message, type, userId });
  }
  if (mail) {
    try {
      await mailService.send(mail);
    } catch (error) {
      log.error('failed to send notification email', { message: error.message, subject: mail.subject, to: maskEmail(mail.to) });
    }
  }
}

async function adminUserIds() {
  const { rows } = await pool.query(
    `SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
      WHERE r.code = 'ADMIN' AND u.deleted_at IS NULL`,
  );
  return rows.map((row) => row.id);
}

/** Avoids importing manager.service.js, which itself calls into this module to notify a newly-assigned manager. */
async function managerUserIdsForHotel(hotelId) {
  const { rows } = await pool.query(`SELECT user_id FROM hotel_managers WHERE hotel_id = $1`, [hotelId]);
  return rows.map((row) => row.user_id);
}

export const notificationService = {
  /** Sent once, after a payment is verified and the booking is CONFIRMED. */
  async sendBookingConfirmation(booking) {
    const bookingRef = booking.booking_ref ?? booking.bookingRef;
    const hotelName = booking.hotel_name ?? booking.hotel?.name ?? '';
    await notify(
      { userId: booking.user_id, type: 'booking.confirmed', title: 'Booking confirmed', message: `Your stay at ${hotelName} is confirmed. Booking ref ${bookingRef}.`, entityType: 'booking', entityId: booking.id },
      { to: booking.primary_email ?? booking.primaryContact?.email, subject: `Booking confirmed: ${hotelName}`.trim(), text: `Your stay at ${hotelName} is confirmed. Booking ref ${bookingRef}.` },
    );

    const managerIds = await managerUserIdsForHotel(booking.hotel_id);
    await Promise.all(managerIds.map((userId) =>
      notify({ userId, type: 'booking.created', title: 'New booking', message: `A new booking (${bookingRef}) was confirmed at ${hotelName}.`, entityType: 'booking', entityId: booking.id })));
  },

  /** Sent after a cancellation is recorded. The refund, if any, is reported as its own status. */
  async sendCancellation(booking) {
    const bookingRef = booking.booking_ref ?? booking.bookingRef;
    const hotelName = booking.hotel_name ?? booking.hotel?.name ?? '';
    await notify(
      { userId: booking.user_id, type: 'booking.cancelled', title: 'Booking cancelled', message: `Your booking ${bookingRef} at ${hotelName} has been cancelled.`, entityType: 'booking', entityId: booking.id },
      { to: booking.primary_email ?? booking.primaryContact?.email, subject: `Booking cancelled: ${bookingRef}`, text: `Your booking ${bookingRef} has been cancelled.` },
    );

    const managerIds = await managerUserIdsForHotel(booking.hotel_id);
    await Promise.all(managerIds.map((userId) =>
      notify({ userId, type: 'booking.cancelled', title: 'Booking cancelled', message: `Booking ${bookingRef} at ${hotelName} was cancelled.`, entityType: 'booking', entityId: booking.id })));
  },

  /** Sent when a Razorpay attempt fails or is abandoned -- the hold stays live so the guest can retry. */
  async sendPaymentFailed(booking) {
    const bookingRef = booking.booking_ref ?? booking.bookingRef;
    await notify({
      userId: booking.user_id, type: 'payment.failed', title: 'Payment failed',
      message: `Your payment for booking ${bookingRef} did not go through. You can try again from My Trips.`,
      entityType: 'booking', entityId: booking.id,
    });
  },

  /** Sent as soon as a cancellation creates a refund (before the gateway has necessarily settled it). */
  async sendRefundInitiated(booking, refund) {
    const bookingRef = booking.booking_ref ?? booking.bookingRef;
    const amount = rupees(refund.amount_minor);
    await notify(
      // entityType/entityId point at the booking, not the refund, since there is no standalone refund
      // viewer page to deep-link to -- My Trips' booking detail is where this is actually shown.
      { userId: booking.user_id, type: 'refund.initiated', title: 'Refund initiated', message: `Your refund of ${amount} for booking ${bookingRef} has been initiated.`, entityType: 'booking', entityId: booking.id },
      { to: booking.primary_email, subject: `Refund initiated: ${bookingRef}`, text: `Your refund of ${amount} has been initiated to your original payment method.` },
    );
  },

  /** Sent once a refund actually reaches SUCCESS at the gateway. */
  async sendRefundCompleted(booking, refund) {
    const bookingRef = booking.booking_ref ?? booking.bookingRef;
    const amount = rupees(refund.amount_minor);
    await notify(
      { userId: booking.user_id, type: 'refund.completed', title: 'Refund completed', message: `Your refund of ${amount} for booking ${bookingRef} has been processed.`, entityType: 'booking', entityId: booking.id },
      { to: booking.primary_email, subject: `Refund processed: ${bookingRef}`, text: `Your refund of ${amount} has been processed.` },
    );
  },

  /** Sent to the review's own author once an ADMIN approves or rejects it. */
  async sendReviewDecision(review, hotelName, action) {
    const approved = action === 'APPROVE';
    await notify({
      userId: review.user_id,
      type: approved ? 'review.approved' : 'review.rejected',
      title: approved ? 'Review published' : 'Review not published',
      message: approved ? `Your review of ${hotelName} is now live.` : `Your review of ${hotelName} was not approved.`,
      entityType: 'review', entityId: review.id,
    });
  },

  /** Sent to every manager of the hotel being reviewed, and every ADMIN, so a new review reaches someone who can moderate it. */
  async sendReviewSubmitted(hotelId, hotelName, reviewId) {
    const [managerIds, admins] = await Promise.all([managerUserIdsForHotel(hotelId), adminUserIds()]);
    const payload = { type: 'review.submitted', title: 'New review awaiting moderation', message: `A new review was submitted for ${hotelName}.`, entityType: 'review', entityId: reviewId };
    await Promise.all([...managerIds, ...admins].map((userId) => notify({ ...payload, userId })));
  },

  /** Sent to every ADMIN once a hotel is submitted for review, so the onboarding queue is visible without polling the dashboard. */
  async sendHotelSubmittedForReview(hotel) {
    const admins = await adminUserIds();
    await Promise.all(admins.map((userId) =>
      notify({ userId, type: 'hotel.submitted', title: 'New hotel submitted', message: `${hotel.name} was submitted for review.`, entityType: 'hotel', entityId: hotel.id })));
  },

  /** Sent to the manager themselves, so they know which hotel they can now operate. */
  async sendManagerAssigned(userId, hotel) {
    await notify({ userId, type: 'manager.assigned', title: 'New hotel assigned', message: `You have been assigned to manage ${hotel.name}.`, entityType: 'hotel', entityId: hotel.id });
  },

  /** Sent to every ADMIN once a partner submits their application, so the approval queue is visible without polling. */
  async sendPartnerApplicationSubmitted(partner) {
    const admins = await adminUserIds();
    await Promise.all(admins.map((userId) =>
      notify({ userId, type: 'partner.submitted', title: 'New partner application', message: `${partner.businessName} submitted a partner application.`, entityType: 'partner', entityId: partner.id })));
  },

  /** Sent to the applicant once an ADMIN approves their partner account. */
  async sendPartnerApplicationApproved(userId) {
    await notify({ userId, type: 'partner.approved', title: 'Partner application approved', message: 'Your partner application has been approved. You can now add your property.', entityType: 'partner', entityId: userId });
  },

  /** Sent to the applicant once an ADMIN rejects their partner account, with the reason given. */
  async sendPartnerApplicationRejected(userId, reason) {
    await notify({ userId, type: 'partner.rejected', title: 'Partner application not approved', message: `Your partner application was not approved: ${reason}`, entityType: 'partner', entityId: userId });
  },
};
