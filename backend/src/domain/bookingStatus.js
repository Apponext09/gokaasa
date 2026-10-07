/**
 * Booking state machine. Booking status describes the reservation; payment status lives on `payments` and
 * refund status on `refunds`, so one status never has to mean two things.
 *
 *   INITIATED ──► PAYMENT_PENDING ──► PAID ──► CONFIRMED ──► CANCELLED ──► REFUND_PENDING ──► REFUNDED
 *       │               │   │
 *       │               │   └──► EXPIRED ──┐
 *       └──► FAILED ◄───┘                  │
 *             └────────────────────────────┴──► REFUND_PENDING   (only for a payment captured after the hold ended)
 *
 * A failed refund leaves the booking in REFUND_PENDING; the refund itself is retried, not the booking moved.
 * CONFIRMED is only ever reached from PAID, which is only reached after a server-verified payment.
 * Opening Razorpay Checkout never changes the booking.
 */
export const BOOKING_STATUS = Object.freeze({
  INITIATED: 'INITIATED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAID: 'PAID',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
});

const B = BOOKING_STATUS;

const ALLOWED = {
  [B.INITIATED]: [B.PAYMENT_PENDING, B.FAILED],
  [B.PAYMENT_PENDING]: [B.PAID, B.FAILED, B.EXPIRED],
  [B.PAID]: [B.CONFIRMED, B.REFUND_PENDING],
  [B.CONFIRMED]: [B.CANCELLED],
  [B.CANCELLED]: [B.REFUND_PENDING],
  [B.REFUND_PENDING]: [B.REFUNDED],
  [B.EXPIRED]: [B.REFUND_PENDING],
  [B.REFUNDED]: [],
  [B.FAILED]: [B.REFUND_PENDING],
};

/** Statuses that hold a room for a guest who has a booking to keep (used by My Trips "Upcoming"). */
export const LIVE_BOOKING_STATUSES = Object.freeze([B.CONFIRMED]);

export function canTransition(from, to) {
  return (ALLOWED[from] ?? []).includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid booking transition ${from} -> ${to}`);
  }
}
