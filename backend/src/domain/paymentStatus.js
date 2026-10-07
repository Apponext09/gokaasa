/**
 * Payment state machine. Each Razorpay order is one payment attempt. A failed attempt is never reused:
 * a retry creates a new order and a new row with attempt + 1.
 *
 *   CREATED ──► PENDING ──► SUCCESS ──► REFUNDED
 *       │          │
 *       └──────────┴──► FAILED
 *
 * FAILED ──► SUCCESS is allowed only for a "late capture": the gateway captured money after the hold had
 * already expired. The booking is then refunded, never confirmed.
 */
export const PAYMENT_STATUS = Object.freeze({
  CREATED: 'CREATED',
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
});

const P = PAYMENT_STATUS;

const ALLOWED = {
  [P.CREATED]: [P.PENDING, P.SUCCESS, P.FAILED],
  [P.PENDING]: [P.SUCCESS, P.FAILED],
  [P.SUCCESS]: [P.REFUNDED],
  [P.FAILED]: [P.SUCCESS],
  [P.REFUNDED]: [],
};

export function canTransitionPayment(from, to) {
  return (ALLOWED[from] ?? []).includes(to);
}

/** Payments that still represent a checkout the guest may complete. */
export const OPEN_PAYMENT_STATUSES = Object.freeze([P.CREATED, P.PENDING]);
