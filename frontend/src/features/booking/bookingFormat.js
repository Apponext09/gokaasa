/** Display helpers for booking screens. Dates are calendar days, so they are formatted in UTC to avoid a day shift. */

export const STEPS = [
  { key: 'search', label: 'Search' },
  { key: 'room', label: 'Room' },
  { key: 'guests', label: 'Guest details' },
  { key: 'review', label: 'Review' },
  { key: 'payment', label: 'Payment' },
  { key: 'confirmed', label: 'Confirmed' },
];

export const formatStayDate = (iso, options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { ...options, timeZone: 'UTC' });

export const formatMoneyMinor = (minor, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(minor) / 100);

export const formatCountdown = (seconds) => {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
};

export const BOOKING_STATUS_LABEL = {
  INITIATED: { label: 'Starting', tone: 'neutral' },
  PAYMENT_PENDING: { label: 'Payment pending', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'brand' },
  CONFIRMED: { label: 'Confirmed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
  REFUND_PENDING: { label: 'Refund pending', tone: 'warning' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
  FAILED: { label: 'Not completed', tone: 'danger' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
};

export const occupancyLabel = (occupancy = []) => {
  const adults = occupancy.reduce((sum, room) => sum + room.adults, 0);
  const children = occupancy.reduce((sum, room) => sum + room.childAges.length, 0);
  const rooms = occupancy.length;
  return `${rooms} room${rooms === 1 ? '' : 's'} · ${adults} adult${adults === 1 ? '' : 's'}${children ? ` · ${children} child${children === 1 ? '' : 'ren'}` : ''}`;
};

export const EXPIRED_MESSAGE = 'Your room hold has expired. Please search again.';
