/**
 * Review moderation state. A new review always starts PENDING; only an admin action moves it from there.
 * Editing an approved/rejected/hidden review sends it back to PENDING (it changed, so it needs re-review).
 *
 *   PENDING ──► APPROVED ──► HIDDEN ──► APPROVED   (admin can restore a hidden review)
 *       └─────► REJECTED ──► APPROVED              (admin can reconsider a rejection)
 *
 * APPROVED is the only status counted in public rating aggregates and shown on the hotel page.
 */
export const REVIEW_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  HIDDEN: 'HIDDEN',
});

const S = REVIEW_STATUS;

const ALLOWED = {
  [S.PENDING]: [S.APPROVED, S.REJECTED],
  [S.APPROVED]: [S.HIDDEN, S.REJECTED],
  [S.REJECTED]: [S.APPROVED],
  [S.HIDDEN]: [S.APPROVED],
};

export function canTransitionReview(from, to) {
  return (ALLOWED[from] ?? []).includes(to);
}
