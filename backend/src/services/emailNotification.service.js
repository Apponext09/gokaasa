import { pool, withTransaction } from '../db/pool.js';
import { config } from '../config/index.js';
import { emailDeliveryRepository } from '../repositories/emailDelivery.repository.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { paymentRepository } from '../repositories/payment.repository.js';
import { mailService } from './mail.service.js';
import { renderEmail } from '../email/templates.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('email-notifications');
const maskEmail = (email) => typeof email === 'string' ? email.replace(/^(.).*(@.*)$/, '$1***$2') : null;

async function supportEmail(client = pool) {
  if (config.mail.supportEmail) return config.mail.supportEmail;
  const { rows } = await client.query(`SELECT value FROM platform_settings WHERE key = 'support_email'`);
  return rows[0]?.value || null;
}

async function enqueue(client, delivery) {
  if (!delivery.to) {
    log.warn('email recipient is not configured', { eventType: delivery.eventType, recipientType: delivery.recipientType });
    return null;
  }
  return emailDeliveryRepository.enqueue(client, delivery);
}

async function bookingContext(client, bookingId) {
  const booking = await bookingRepository.findBooking(bookingId, client);
  const rooms = await bookingRepository.bookingRooms(bookingId, client);
  const payments = await paymentRepository.paymentsForBooking(bookingId, client);
  const payment = payments.find((row) => ['SUCCESS', 'REFUNDED'].includes(row.status)) ?? payments.at(-1) ?? null;
  const contacts = await client.query(
    `SELECT u.id, u.email::text AS email, u.first_name, u.last_name,
            CASE WHEN EXISTS (
              SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
               WHERE ur.user_id = u.id AND r.code = 'HOTEL_OWNER'
            ) THEN 'HOTEL_OWNER' ELSE 'HOTEL_MANAGER' END AS role
       FROM hotel_managers hm
       JOIN users u ON u.id = hm.user_id AND u.is_active AND u.deleted_at IS NULL
      WHERE hm.hotel_id = $1
        AND EXISTS (
          SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = u.id AND r.code IN ('HOTEL_OWNER', 'HOTEL_MANAGER')
        )
      ORDER BY CASE WHEN EXISTS (
        SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = u.id AND r.code = 'HOTEL_OWNER'
      ) THEN 0 ELSE 1 END, u.id`,
    [booking.hotel_id],
  );
  const hotel = await client.query(`SELECT email::text AS email, phone FROM hotels WHERE id = $1`, [booking.hotel_id]);
  const support = await supportEmail(client);
  const base = {
    bookingRef: booking.booking_ref,
    bookingStatus: booking.status,
    hotelName: booking.hotel_name,
    hotelAddress: [booking.hotel_address, booking.hotel_city, booking.hotel_country_code].filter(Boolean).join(', '),
    hotelContact: hotel.rows[0]?.phone || hotel.rows[0]?.email || null,
    customerFirstName: booking.primary_first_name,
    customerName: `${booking.primary_first_name} ${booking.primary_last_name}`.trim(),
    customerEmail: booking.primary_email,
    customerPhone: booking.primary_phone,
    roomName: rooms.map((room) => room.room_name).filter(Boolean).join(', '),
    rooms: booking.rooms_count,
    guests: Number(booking.adults) + Number(booking.children),
    checkIn: booking.check_in,
    checkOut: booking.check_out,
    nights: rooms[0]?.nights ?? Math.round((Date.parse(`${booking.check_out}T00:00:00Z`) - Date.parse(`${booking.check_in}T00:00:00Z`)) / 86_400_000),
    currency: booking.currency,
    subtotal: Number(booking.subtotal_minor),
    discount: Number(booking.discount_minor),
    taxes: Number(booking.taxes_minor),
    fees: Number(booking.fees_minor),
    total: Number(booking.total_minor),
    paymentStatus: payment?.status ?? 'NOT_STARTED',
    paymentMethod: payment?.provider_payload?.method ?? null,
    paymentProvider: payment?.provider ?? null,
    paymentReference: payment?.provider_payment_id ?? null,
    cancellationPolicy: booking.cancellation_policy?.description || booking.cancellation_policy?.name || null,
    specialRequest: booking.special_request,
    createdAt: booking.created_at?.toISOString?.() ?? String(booking.created_at ?? ''),
    confirmedAt: booking.updated_at?.toISOString?.() ?? String(booking.updated_at ?? ''),
    supportEmail: support,
  };
  return { booking, contacts: contacts.rows, hotelFallbackEmail: hotel.rows[0]?.email ?? null, base };
}

async function processDelivery(delivery) {
  try {
    const message = renderEmail(delivery.template, delivery.payload);
    const result = await mailService.send({ to: delivery.recipient_email, ...message });
    await emailDeliveryRepository.markAccepted(delivery.id, result?.messageId);
    log.info(result?.simulated ? 'email captured by test transport' : 'email accepted by SMTP provider', {
      eventType: delivery.event_type, recipientType: delivery.recipient_type,
      recipient: maskEmail(delivery.recipient_email), providerMessageId: result?.messageId ?? null,
    });
  } catch (error) {
    await emailDeliveryRepository.markFailed(delivery.id, error?.message || 'SMTP send failed', delivery.attempt_count);
    log.error('email attempt failed', {
      eventType: delivery.event_type, recipientType: delivery.recipient_type,
      recipient: maskEmail(delivery.recipient_email), attempt: delivery.attempt_count,
      message: String(error?.message || 'SMTP send failed').slice(0, 200),
    });
  }
}

export const emailNotificationService = {
  async enqueueWelcome(client, user) {
    const support = await supportEmail(client);
    return enqueue(client, {
      eventKey: `customer.registered:${user.id}`, eventType: 'customer.registered', recipientType: 'CUSTOMER',
      to: user.email, template: 'welcome', payload: { firstName: user.firstName, frontendUrl: config.frontendUrl, supportEmail: support },
    });
  },

  async enqueuePartnerDecision(client, user, { approved, reason = null, eventKey = null }) {
    const support = await supportEmail(client);
    return enqueue(client, {
      eventKey: eventKey ?? `partner.${approved ? 'approved' : 'rejected'}:${user.id}`, eventType: `partner.${approved ? 'approved' : 'rejected'}`,
      recipientType: 'PARTNER', to: user.email, template: approved ? 'partnerApproved' : 'partnerRejected',
      payload: { firstName: user.firstName, reason, portalUrl: `${config.frontendUrl}/partner/status`, supportEmail: support },
    });
  },

  async enqueueHotelOnboarded(client, user, hotel) {
    const support = await supportEmail(client);
    return enqueue(client, {
      eventKey: `hotel.onboarded:${hotel.id}:${user.id}`, eventType: 'hotel.onboarded', recipientType: 'PARTNER',
      to: user.email, template: 'hotelOnboarded',
      payload: { hotelName: hotel.name, status: hotel.status, portalUrl: `${config.frontendUrl}/admin/hotels/${hotel.id}`, supportEmail: support },
    });
  },

  async enqueuePropertyDecision(client, hotel, { approved, feedback = null }) {
    const support = await supportEmail(client);
    const { rows } = await client.query(
      `SELECT DISTINCT u.id, u.email::text AS email
         FROM hotel_managers hm JOIN users u ON u.id = hm.user_id AND u.is_active AND u.deleted_at IS NULL
        WHERE hm.hotel_id = $1 AND EXISTS (
          SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = u.id AND r.code IN ('HOTEL_OWNER', 'HOTEL_MANAGER')
        )`, [hotel.id],
    );
    const event = approved ? 'property.approved' : 'property.rejected';
    const transitionAt = new Date(hotel.updatedAt ?? hotel.updated_at).toISOString();
    for (const user of rows) {
      await enqueue(client, {
        eventKey: `${event}:${hotel.id}:${transitionAt}`, eventType: event, recipientType: 'PARTNER', to: user.email,
        template: approved ? 'propertyApproved' : 'propertyRejected',
        payload: { hotelName: hotel.name, status: hotel.status, feedback, portalUrl: `${config.frontendUrl}/admin/hotels/${hotel.id}`, supportEmail: support },
      });
    }
  },

  async enqueueBookingConfirmation(client, bookingId) {
    const { booking, contacts, hotelFallbackEmail, base } = await bookingContext(client, bookingId);
    if (booking.status !== 'CONFIRMED') return;
    const eventKey = `booking.confirmed:${booking.booking_ref}`;
    await enqueue(client, {
      eventKey, eventType: 'booking.confirmed', recipientType: 'CUSTOMER', to: booking.primary_email,
      template: 'customerBooking', payload: { ...base, bookingUrl: `${config.frontendUrl}/my-trips` },
    });
    const hotelRecipients = contacts.length > 0 ? contacts : hotelFallbackEmail ? [{ email: hotelFallbackEmail }] : [];
    if (hotelRecipients.length === 0) log.warn('confirmed booking has no hotel notification recipient', { bookingRef: booking.booking_ref, hotelId: booking.hotel_id });
    for (const contact of hotelRecipients) {
      await enqueue(client, {
        eventKey, eventType: 'booking.confirmed', recipientType: 'HOTEL', to: contact.email,
        template: 'hotelBooking', payload: { ...base, partnerBookingUrl: `${config.frontendUrl}/admin/bookings?search=${encodeURIComponent(booking.booking_ref)}` },
      });
    }
    let adminRecipients = config.mail.bookingAdminEmail ? [config.mail.bookingAdminEmail] : [];
    if (adminRecipients.length === 0) {
      const admins = await client.query(
        `SELECT DISTINCT u.email::text AS email FROM users u
          JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
         WHERE r.code = 'ADMIN' AND u.is_active AND u.deleted_at IS NULL`,
      );
      adminRecipients = admins.rows.map((row) => row.email);
    }
    for (const adminEmail of adminRecipients) {
      await enqueue(client, {
        eventKey, eventType: 'booking.confirmed', recipientType: 'ADMIN', to: adminEmail,
        template: 'adminBooking', payload: {
          ...base, ownerName: contacts[0] ? `${contacts[0].first_name ?? ''} ${contacts[0].last_name ?? ''}`.trim() : null,
          adminBookingUrl: `${config.frontendUrl}/admin/bookings?search=${encodeURIComponent(booking.booking_ref)}`,
        },
      });
    }
    if (adminRecipients.length === 0) {
      log.warn('confirmed booking has no configured or active admin recipient', { bookingRef: booking.booking_ref });
    }
  },

  async enqueueBookingEvent(client, booking, { type, template, amount = null, refundStatus = null }) {
    const support = await supportEmail(client);
    return enqueue(client, {
      eventKey: `${type}:${booking.booking_ref}`, eventType: type, recipientType: 'CUSTOMER', to: booking.primary_email,
      template, payload: { bookingRef: booking.booking_ref, hotelName: booking.hotel_name, currency: booking.currency, amount, refundStatus, bookingUrl: `${config.frontendUrl}/my-trips`, supportEmail: support },
    });
  },

  async processDue({ eventKey = null, limit = 20 } = {}) {
    const deliveries = await withTransaction((client) => emailDeliveryRepository.claimDue(client, { eventKey, limit }));
    await Promise.all(deliveries.map(processDelivery));
    return deliveries.length;
  },

  async processEvent(eventKey) {
    try {
      return await this.processDue({ eventKey, limit: 50 });
    } catch (error) {
      log.error('immediate email dispatch failed; background retry will continue', { eventKey, message: error.message });
      return 0;
    }
  },

  async recover() {
    await emailDeliveryRepository.releaseStale();
    return this.processDue();
  },
};

