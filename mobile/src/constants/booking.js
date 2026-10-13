/**
 * Mirrors backend/src/domain/occupancy.js and the website's bookingFormat.js exactly -- these are the
 * backend's own real limits/status values, not invented here. Keep these two files in sync if the
 * backend's domain rules ever change.
 */
export const OCCUPANCY_LIMITS = Object.freeze({
  maxRooms: 8,
  minAdults: 1,
  maxAdults: 6,
  maxChildrenPerRoom: 4,
  minAge: 0,
  maxAge: 17,
});

export const DEFAULT_OCCUPANCY = [{ adults: 2, childAges: [] }];

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

export const MEAL_PLAN_LABEL = {
  ROOM_ONLY: 'Room only',
  BREAKFAST: 'Breakfast included',
  HALF_BOARD: 'Half board',
  FULL_BOARD: 'Full board',
};

export const PROPERTY_TYPE_LABEL = {
  HOTEL: 'Hotel',
  RESORT: 'Resort',
  VILLA: 'Villa',
  APARTMENT: 'Apartment',
  HOSTEL: 'Hostel',
  GUEST_HOUSE: 'Guest house',
};
