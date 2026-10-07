/**
 * Pricing and date rules for room inventory. Money is integer minor units (paise). Every component is
 * computed here and stored, so a price can always be explained line by line.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_STAY_NIGHTS = 30;
export const MAX_CALENDAR_DAYS = 370;

/** Rounds to the nearest minor unit, halves away from zero (same rule as Postgres ROUND). */
export function roundMinor(value) {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/**
 * Components of one night's price. Discount is taken from the base; tax applies to the discounted base;
 * the fee is a flat per-night amount on the plan.
 */
export function priceComponents({ baseMinor, discountPercent = 0, taxPercent = 0, feeMinor = 0 }) {
  if (!Number.isInteger(baseMinor) || baseMinor < 0) throw new Error('baseMinor must be a non-negative integer');
  const discount = roundMinor((baseMinor * Number(discountPercent)) / 100);
  const taxable = baseMinor - discount;
  const tax = roundMinor((taxable * Number(taxPercent)) / 100);
  const fee = Number(feeMinor);
  const final = baseMinor - discount + tax + fee;
  return { base: baseMinor, discount, tax, fee, final };
}

/** ISO date helpers. Dates are calendar days with no timezone, so arithmetic is done on UTC midnight. */
export function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

export function addDays(isoDate, days) {
  return new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Calendar nights from check-in (inclusive) to check-out (exclusive). */
export function nightsBetween(checkIn, checkOut) {
  const nights = [];
  for (let day = checkIn; day < checkOut; day = addDays(day, 1)) nights.push(day);
  return nights;
}

export function daysBetween(from, to) {
  return Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Sums nightly components for `rooms` rooms of one rate plan. Each night must be present. */
export function quoteNights(nightlyRows, rooms) {
  const totals = { base: 0, discount: 0, tax: 0, fee: 0, final: 0 };
  for (const row of nightlyRows) {
    totals.base += row.base;
    totals.discount += row.discount;
    totals.tax += row.tax;
    totals.fee += row.fee;
    totals.final += row.final;
  }
  return {
    rooms,
    nights: nightlyRows.length,
    subtotal: totals.base * rooms,
    discount: totals.discount * rooms,
    taxes: totals.tax * rooms,
    fees: totals.fee * rooms,
    finalAmount: totals.final * rooms,
    averagePerNight: nightlyRows.length ? Math.round(totals.final / nightlyRows.length) : 0,
  };
}
