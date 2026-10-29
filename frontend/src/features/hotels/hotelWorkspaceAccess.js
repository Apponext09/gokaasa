export function hotelWorkspaceAccess({ status, canEdit, isAdmin, isReviewExecutive }) {
  // A Review Executive reviews and comments but never edits hotel content. An ADMIN may also carry
  // that role, so ADMIN precedence is intentional: admins retain full edit/review/publish control.
  const reviewOnly = Boolean(isReviewExecutive && !isAdmin);
  const waitingForReviewer = status === 'PENDING_REVIEW' && !isAdmin;
  const readOnly = status === 'ARCHIVED' || waitingForReviewer || canEdit === false || reviewOnly;

  return { readOnly, reviewOnly, waitingForReviewer };
}
