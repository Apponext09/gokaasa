import { pool, withTransaction } from '../db/pool.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { paymentRepository } from '../repositories/payment.repository.js';
import { inventoryRepository } from '../repositories/inventory.repository.js';
import { roomTypeRepository } from '../repositories/roomType.repository.js';
import { ratePlanRepository } from '../repositories/ratePlan.repository.js';
import { loadNightly } from './inventory.service.js';
import { getGateway } from '../payments/index.js';
import { BOOKING_STATUS } from '../domain/bookingStatus.js';
import { PAYMENT_STATUS } from '../domain/paymentStatus.js';
import { nightsBetween, priceComponents } from '../domain/pricing.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import { auditService } from './audit.service.js';
import { buildBookingDto } from './booking.service.js';

const log = createLogger('booking-extension');

async function requireConfirmedBooking(client, userId, bookingId, { lock = false } = {}) {
  const db = client ?? pool;
  const booking = lock
    ? await bookingRepository.lockBooking(bookingId, db)
    : await bookingRepository.findBooking(bookingId, db);

  if (!booking || booking.user_id !== userId) {
    throw AppError.notFound('Booking not found');
  }
  if (booking.status !== BOOKING_STATUS.CONFIRMED) {
    throw AppError.conflict('Only confirmed bookings can be extended.');
  }
  return booking;
}

export const bookingExtensionService = {
  /**
   * Check if a stay can be extended to `newCheckOut`.
   * Verifies that newCheckOut > current check_out, calculates extra nights,
   * checks inventory under lock, and calculates price for extra nights.
   */
  async checkExtension(userId, bookingId, { newCheckOut }) {
    return withTransaction(async (client) => {
      const booking = await requireConfirmedBooking(client, userId, bookingId, { lock: false });
      const currentCheckOut = booking.check_out;

      if (newCheckOut <= currentCheckOut) {
        throw AppError.unprocessable('New check-out date must be after current check-out date', [
          { field: 'newCheckOut', message: `Must be after ${currentCheckOut}` },
        ]);
      }

      const extraNights = nightsBetween(currentCheckOut, newCheckOut);
      if (extraNights.length === 0) {
        throw AppError.unprocessable('At least 1 extra night is required for extension');
      }
      if (extraNights.length > 30) {
        throw AppError.unprocessable('Extensions are capped at 30 nights');
      }

      // Check room and rate plan
      const rooms = await bookingRepository.bookingRooms(booking.id, client);
      if (!rooms || rooms.length === 0) {
        throw AppError.conflict('Booking room details not found');
      }
      const room = rooms[0];
      const roomTypeId = room.room_type_id;

      // Lock room type and check inventory for extra nights
      await roomTypeRepository.lockById(roomTypeId, client);
      const nightly = await loadNightly(client, [roomTypeId], extraNights);
      const facts = extraNights.map((date) => nightly.get(`${roomTypeId}|${date}`));
      const availableRooms = Math.min(...facts.map((n) => n?.sellable ?? 0));

      if (availableRooms < booking.rooms_count) {
        return {
          available: false,
          reason: 'ROOM_NOT_AVAILABLE',
          message: 'Sorry, this room type is not available for the requested extension dates as it is fully booked.',
          currentCheckOut,
          newCheckOut,
          requestedNights: extraNights.length,
          availableRooms: Math.max(0, availableRooms),
        };
      }

      // Calculate nightly pricing for extra nights
      const activeRatePlanId =
        room.rate_plan_id ||
        (booking.hold_id
          ? (await client.query('SELECT rate_plan_id FROM booking_holds WHERE id = $1', [booking.hold_id])).rows[0]?.rate_plan_id
          : null) ||
        (await client.query('SELECT id FROM rate_plans WHERE room_type_id = $1 LIMIT 1', [room.room_type_id])).rows[0]?.id;
      const ratePrices = await bookingRepository.nightlyPrices(activeRatePlanId, currentCheckOut, newCheckOut, client);
      let subtotal = 0;
      let discount = 0;
      let taxes = 0;
      let fees = 0;
      let total = 0;

      if (ratePrices.length === extraNights.length) {
        for (const rp of ratePrices) {
          subtotal += Number(rp.base_price_minor) * booking.rooms_count;
          discount += Number(rp.discount_minor ?? 0) * booking.rooms_count;
          taxes += Number(rp.tax_minor) * booking.rooms_count;
          fees += Number(rp.fee_minor) * booking.rooms_count;
          total += Number(rp.final_price_minor) * booking.rooms_count;
        }
      } else {
        // Fallback to rate plan base price
        const ratePlanId = activeRatePlanId;
        const plan = await ratePlanRepository.findById(ratePlanId, client);
        if (!plan || plan.base_price_minor == null) {
          throw AppError.conflict('Nightly rates are not configured for this room');
        }
        const components = priceComponents({
          baseMinor: Number(plan.base_price_minor),
          discountPercent: plan.discount_percent ?? 0,
          currency: booking.currency,
        });
        subtotal = components.base * booking.rooms_count * extraNights.length;
        discount = components.discount * booking.rooms_count * extraNights.length;
        taxes = components.tax * booking.rooms_count * extraNights.length;
        fees = components.fee * booking.rooms_count * extraNights.length;
        total = components.final * booking.rooms_count * extraNights.length;
      }

      return {
        available: true,
        currentCheckOut,
        newCheckOut,
        extraNights: extraNights.length,
        extraNightsDates: extraNights,
        currency: booking.currency,
        subtotalMinor: subtotal,
        discountMinor: discount,
        taxesMinor: taxes,
        feesMinor: fees,
        totalMinor: total,
      };
    });
  },

  /**
   * Create a Razorpay order specifically for the extension payment difference.
   */
  async createExtensionOrder(userId, bookingId, { newCheckOut }) {
    const preview = await this.checkExtension(userId, bookingId, { newCheckOut });
    if (!preview.available) {
      throw AppError.conflict(preview.message, { code: 'ROOM_NOT_AVAILABLE' });
    }

    const gateway = getGateway();
    const booking = await requireConfirmedBooking(null, userId, bookingId, { lock: false });
    const orderReceipt = `${booking.booking_ref}-EXT-${Date.now().toString().slice(-4)}`;

    const order = await gateway.createOrder({
      amountMinor: preview.totalMinor,
      currency: preview.currency,
      receipt: orderReceipt,
      notes: {
        bookingId: String(booking.id),
        bookingRef: booking.booking_ref,
        extensionTo: newCheckOut,
        extraNights: String(preview.extraNights),
      },
    });

    // Record a PENDING payment row linked to booking
    const attempt = await paymentRepository.nextAttempt(pool, booking.id);
    await paymentRepository.insertPayment(
      pool,
      {
        bookingId: booking.id,
        orderId: order.id,
        amountMinor: preview.totalMinor,
        currency: preview.currency,
        attempt,
        gatewayMode: gateway.mode,
        receipt: orderReceipt,
      }
    );
    // Store extension metadata in provider_payload
    await pool.query(
      "UPDATE payments SET provider_payload = $1 WHERE provider_order_id = $2",
      [
        JSON.stringify({
          extension: true,
          newCheckOut,
          extraNights: preview.extraNights,
          subtotalMinor: preview.subtotalMinor,
          discountMinor: preview.discountMinor,
          taxesMinor: preview.taxesMinor,
          feesMinor: preview.feesMinor,
        }),
        order.id,
      ]
    );

    return {
      orderId: order.id,
      amount: order.amount,
      amountMinor: preview.totalMinor,
      currency: preview.currency,
      keyId: gateway.simulated ? null : gateway.publicKeyId,
      simulated: gateway.simulated,
      description: `Stay extension for ${booking.hotel_name} (+${preview.extraNights} night${preview.extraNights === 1 ? '' : 's'})`,
      newCheckOut,
      extraNights: preview.extraNights,
      prefill: {
        name: `${booking.primary_first_name} ${booking.primary_last_name}`,
        email: booking.primary_email,
        contact: booking.primary_phone,
      },
    };
  },

  /**
   * Confirm extension after successful payment.
   * Updates booking check_out date, total, paid amounts, inserts inventory reservations,
   * records the extension row, and marks payment SUCCESS.
   */
  async confirmExtension(userId, bookingId, { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature }) {
    const gateway = getGateway();
    if (!gateway.verifyPaymentSignature({ orderId, paymentId, signature })) {
      throw AppError.badRequest('Invalid payment signature', { code: 'PAYMENT_SIGNATURE_INVALID' });
    }

    const providerPayment = await gateway.fetchPayment(paymentId);
    if (providerPayment.order_id !== orderId) {
      throw AppError.badRequest('Payment order mismatch');
    }
    if (providerPayment.status !== 'captured') {
      throw AppError.badRequest('Payment was not captured');
    }

    const result = await withTransaction(async (client) => {
      const booking = await requireConfirmedBooking(client, userId, bookingId, { lock: true });
      const payment = await paymentRepository.lockByOrder(orderId, client);
      if (!payment || payment.booking_id !== booking.id) {
        throw AppError.notFound('Payment order not found for this booking');
      }
      if (payment.status === PAYMENT_STATUS.SUCCESS) {
        return { alreadyDone: true, bookingId: booking.id };
      }

      const payload = payment.provider_payload || {};
      const newCheckOut = payload.newCheckOut;
      if (!newCheckOut || newCheckOut <= booking.check_out) {
        throw AppError.conflict('Invalid extension target date in payment payload');
      }

      const extraNights = nightsBetween(booking.check_out, newCheckOut);
      const rooms = await bookingRepository.bookingRooms(booking.id, client);
      const room = rooms[0];

      // 1. Insert inventory reservations for the extra nights
      for (const stayDate of extraNights) {
        await client.query(
          `INSERT INTO inventory_reservations (room_type_id, stay_date, quantity, status, booking_id, updated_at)
           VALUES ($1, $2, $3, 'CONFIRMED', $4, now())`,
          [room.room_type_id, stayDate, booking.rooms_count, booking.id]
        );
      }

      // 2. Mark payment SUCCESS
      await paymentRepository.updatePayment(client, payment.id, PAYMENT_STATUS.SUCCESS, {
        provider_payment_id: paymentId,
        paid_at: new Date(),
        provider_payload: { ...payload, providerPayment },
      });

      // 3. Insert record in booking_extensions table
      const extensionRecord = await bookingRepository.insertBookingExtension(client, {
        bookingId: booking.id,
        originalCheckOut: booking.check_out,
        extendedCheckOut: newCheckOut,
        additionalNights: extraNights.length,
        additionalAmountMinor: payment.amount_minor,
        paymentId: payment.id,
        status: 'CONFIRMED',
      });

      // 4. Update booking row (respecting bookings_total check constraint)
      const extraSubtotal = Number(payload.subtotalMinor ?? payment.amount_minor);
      const extraDiscount = Number(payload.discountMinor ?? 0);
      const extraTaxes = Number(payload.taxesMinor ?? 0);
      const extraFees = Number(payload.feesMinor ?? 0);
      const newSubtotalMinor = Number(booking.subtotal_minor) + extraSubtotal;
      const newDiscountMinor = Number(booking.discount_minor) + extraDiscount;
      const newTaxesMinor = Number(booking.taxes_minor) + extraTaxes;
      const newFeesMinor = Number(booking.fees_minor) + extraFees;
      const newTotalMinor = Number(booking.total_minor) + Number(payment.amount_minor);
      const newPaidMinor = Number(booking.paid_minor) + Number(payment.amount_minor);
      await client.query(
        `UPDATE bookings
            SET check_out = $1,
                subtotal_minor = $2,
                discount_minor = $3,
                taxes_minor = $4,
                fees_minor = $5,
                total_minor = $6,
                paid_minor = $7,
                updated_at = now()
          WHERE id = $8`,
        [newCheckOut, newSubtotalMinor, newDiscountMinor, newTaxesMinor, newFeesMinor, newTotalMinor, newPaidMinor, booking.id]
      );

      // 5. Update booking_rooms nights count & total
      await client.query(
        `UPDATE booking_rooms
            SET nights = nights + $1,
                total_minor = total_minor + $2
          WHERE booking_id = $3`,
        [extraNights.length, payment.amount_minor, booking.id]
      );

      // 6. Audit log
      await auditService.record(client, {
        actor: { id: userId },
        action: 'booking.extended',
        entity: 'booking',
        entityId: booking.id,
        newValue: {
          originalCheckOut: booking.check_out,
          newCheckOut,
          additionalNights: extraNights.length,
          additionalAmountMinor: Number(payment.amount_minor),
          paymentId,
        },
      });

      log.info('booking extended', {
        bookingId: booking.id,
        bookingRef: booking.booking_ref,
        originalCheckOut: booking.check_out,
        newCheckOut,
        additionalNights: extraNights.length,
      });

      return { extension: extensionRecord, bookingId: booking.id };
    });

    const updatedBooking = await bookingRepository.findBooking(result.bookingId);
    return {
      status: 'CONFIRMED',
      extension: result.extension,
      booking: await buildBookingDto(null, updatedBooking),
    };
  },
};
