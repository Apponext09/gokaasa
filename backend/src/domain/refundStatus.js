/**
 * Refund state machine. A refund row is created once per cancellation and moves forward only.
 *
 *   PENDING ──► PROCESSING ──► SUCCESS
 *                   │
 *                   └──► FAILED ──► PROCESSING   (an operator retry, same refund row, same idempotency key)
 *
 * Only one refund per booking may be PENDING, PROCESSING or SUCCESS (enforced by a partial unique index).
 */
export const REFUND_STATUS = Object.freeze({
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
});

const R = REFUND_STATUS;

const ALLOWED = {
  [R.PENDING]: [R.PROCESSING],
  [R.PROCESSING]: [R.SUCCESS, R.FAILED],
  [R.FAILED]: [R.PROCESSING],
  [R.SUCCESS]: [],
};

export function canTransitionRefund(from, to) {
  return (ALLOWED[from] ?? []).includes(to);
}
