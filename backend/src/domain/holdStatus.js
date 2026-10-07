/**
 * Hold state machine. A hold is a short claim on rooms while the guest completes the booking.
 *
 *   HELD ──► CONVERTED   (payment verified; reservations become CONFIRMED)
 *   HELD ──► EXPIRED     (expires_at passed; reservations are released)
 *   HELD ──► RELEASED    (guest left, or payment failed/cancelled before confirmation)
 *
 * CONVERTED, EXPIRED and RELEASED are terminal. A hold that is HELD but past expires_at is treated as
 * EXPIRED on every read, even before the expiry worker has written that status.
 */
export const HOLD_STATUS = Object.freeze({
  HELD: 'HELD',
  CONVERTED: 'CONVERTED',
  EXPIRED: 'EXPIRED',
  RELEASED: 'RELEASED',
});

const H = HOLD_STATUS;

const ALLOWED = {
  [H.HELD]: [H.CONVERTED, H.EXPIRED, H.RELEASED],
  [H.CONVERTED]: [],
  [H.EXPIRED]: [],
  [H.RELEASED]: [],
};

export function canTransitionHold(from, to) {
  return (ALLOWED[from] ?? []).includes(to);
}

export function assertHoldTransition(from, to) {
  if (!canTransitionHold(from, to)) {
    throw new Error(`Invalid hold transition ${from} -> ${to}`);
  }
}

/** True when the hold can still be paid for: it is HELD and its expiry is in the future. */
export function isHoldLive(hold, nowMs = Date.now()) {
  return hold.status === H.HELD && new Date(hold.expires_at).getTime() > nowMs;
}
