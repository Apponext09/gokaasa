/** Formats integer minor units (e.g. paise) for display only. Never use for calculations. */
export function formatMinor(amountMinor, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amountMinor / 100);
}

/** Rounds half-up to an integer number of minor units. */
export function percentOf(amountMinor, percent) {
  return Math.round((amountMinor * percent) / 100);
}
