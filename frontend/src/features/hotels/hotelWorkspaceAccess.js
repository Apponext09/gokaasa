export function hotelWorkspaceAccess({ status, canEdit, isAdmin, isReviewExecutive, isOnboardingExecutive }) {
  // A pure Review Executive reviews and comments but never edits hotel content. An ADMIN may also
  // carry that role, so ADMIN precedence is intentional: admins retain full edit/review/publish
  // control. A Hotel Onboarding Executive individually granted review access (hotel_review_access)
  // holds the console.review permission *in addition to* console.onboarding -- they are not a pure
  // reviewer, so isOnboardingExecutive must also exclude reviewOnly or they'd be locked out of the
  // hotels they create and onboard themselves.
  const reviewOnly = Boolean(isReviewExecutive && !isAdmin && !isOnboardingExecutive);
  const waitingForReviewer = status === 'PENDING_REVIEW' && !isAdmin;
  const readOnly = status === 'ARCHIVED' || waitingForReviewer || canEdit === false || reviewOnly;

  return { readOnly, reviewOnly, waitingForReviewer };
}
