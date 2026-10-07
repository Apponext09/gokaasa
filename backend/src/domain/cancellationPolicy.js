/**
 * Cancellation rules. A policy has one deadline tier:
 *   - cancelled at least `cancellation_deadline_hours` before check-in  -> `refund_percent` refunded
 *   - cancelled later                                                  -> nothing refunded
 *   - non-refundable                                                   -> nothing refunded, ever
 * Different rate plans can point at different policies; nothing here is hardcoded per hotel.
 */

export function refundFor(policy, { amountMinor, hoursBeforeCheckIn }) {
  if (!policy || policy.is_non_refundable || policy.refund_percent === 0) {
    return { refundMinor: 0, refundPercent: 0, reason: 'NON_REFUNDABLE' };
  }
  if (policy.cancellation_deadline_hours == null) {
    return { refundMinor: 0, refundPercent: 0, reason: 'NO_DEADLINE_CONFIGURED' };
  }
  if (hoursBeforeCheckIn >= policy.cancellation_deadline_hours) {
    const refundMinor = Math.round((amountMinor * policy.refund_percent) / 100);
    return { refundMinor, refundPercent: policy.refund_percent, reason: 'BEFORE_DEADLINE' };
  }
  return { refundMinor: 0, refundPercent: 0, reason: 'AFTER_DEADLINE' };
}

/** Customer-facing sentence, generated from the structured fields so wording stays consistent. */
export function describePolicy(policy) {
  if (!policy) return 'Cancellation terms are not set for this rate.';
  if (policy.is_non_refundable) return 'Non-refundable. No refund after booking.';
  const hours = policy.cancellation_deadline_hours;
  const when = hours == null ? '' : hours % 24 === 0 && hours >= 24 ? `${hours / 24} day(s)` : `${hours} hours`;
  if (policy.refund_percent === 100) return `Free cancellation if cancelled at least ${when} before check-in.`;
  if (policy.refund_percent === 0) return 'No refund for cancellations.';
  return `${policy.refund_percent}% refund if cancelled at least ${when} before check-in.`;
}
