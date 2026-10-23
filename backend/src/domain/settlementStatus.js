/**
 * Settlement (hotel payout) lifecycle. Mirrors domain/bookingStatus.js: the only way to change status is
 * through a transition listed here. The full spec enum is kept for forward-compatibility, but only
 * DRAFT -> APPROVED -> PAID -> REVERSED has a real transition today -- PENDING_APPROVAL/PROCESSING/FAILED
 * are reserved for a future two-person maker-checker flow, since only one staff tier (ADMIN) currently has
 * write access to settlements at all.
 */
export const SETTLEMENT_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  PROCESSING: 'PROCESSING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  REVERSED: 'REVERSED',
});

export const SETTLEMENT_ACTION = Object.freeze({
  APPROVE: 'APPROVE',
  MARK_PAID: 'MARK_PAID',
  REVERSE: 'REVERSE',
});

const S = SETTLEMENT_STATUS;

const TRANSITIONS = {
  [SETTLEMENT_ACTION.APPROVE]: { from: [S.DRAFT], to: S.APPROVED },
  [SETTLEMENT_ACTION.MARK_PAID]: { from: [S.APPROVED], to: S.PAID },
  [SETTLEMENT_ACTION.REVERSE]: { from: [S.PAID], to: S.REVERSED },
};

export function resolveTransition(currentStatus, action) {
  const transition = TRANSITIONS[action];
  if (!transition) return null;
  if (!transition.from.includes(currentStatus)) return null;
  return transition.to;
}
