/**
 * Partner (HOTEL_OWNER) application lifecycle. Mirrors domain/hotelStatus.js: the only way to change
 * status is through a transition listed here, so an invalid jump (e.g. DRAFT -> APPROVED) is impossible.
 */
export const PARTNER_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

export const PARTNER_ACTION = Object.freeze({
  SUBMIT: 'SUBMIT',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
});

const S = PARTNER_STATUS;

const TRANSITIONS = {
  // REJECTED can submit again directly -- a rejection isn't a dead end, it's feedback to act on.
  [PARTNER_ACTION.SUBMIT]: { from: [S.DRAFT, S.REJECTED], to: S.PENDING_REVIEW },
  [PARTNER_ACTION.APPROVE]: { from: [S.PENDING_REVIEW], to: S.APPROVED },
  [PARTNER_ACTION.REJECT]: { from: [S.PENDING_REVIEW], to: S.REJECTED },
};

export function resolveTransition(currentStatus, action) {
  const transition = TRANSITIONS[action];
  if (!transition) return null;
  if (!transition.from.includes(currentStatus)) return null;
  return transition.to;
}
