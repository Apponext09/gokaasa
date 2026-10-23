/**
 * Append-only partner ledger vocabulary. These are tags on an immutable row, not a state machine --
 * nothing here governs a transition the way bookingStatus.js/settlementStatus.js do.
 *
 * Direction is always from the HOTEL's perspective: CREDIT increases what Gokaasa owes the hotel, DEBIT
 * decreases it. MANUAL_ADJUSTMENT is reserved for a future ad-hoc correction UI -- nothing in this phase
 * creates one.
 */
export const LEDGER_ENTRY_TYPE = Object.freeze({
  BOOKING_EARNING: 'BOOKING_EARNING',
  PLATFORM_COMMISSION: 'PLATFORM_COMMISSION',
  REFUND_ADJUSTMENT: 'REFUND_ADJUSTMENT',
  COMMISSION_REVERSAL: 'COMMISSION_REVERSAL',
  SETTLEMENT_DEBIT: 'SETTLEMENT_DEBIT',
  SETTLEMENT_REVERSAL: 'SETTLEMENT_REVERSAL',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT',
});

export const LEDGER_DIRECTION = Object.freeze({
  CREDIT: 'CREDIT',
  DEBIT: 'DEBIT',
});

/** Net CREDIT-minus-DEBIT across a set of ledger rows (plain objects with `direction`/`amount_minor` or `amountMinor`). */
export function netForHotel(entries) {
  return entries.reduce((sum, entry) => {
    const amount = Number(entry.amount_minor ?? entry.amountMinor);
    const direction = entry.direction;
    if (direction === LEDGER_DIRECTION.CREDIT) return sum + amount;
    if (direction === LEDGER_DIRECTION.DEBIT) return sum - amount;
    return sum;
  }, 0);
}
