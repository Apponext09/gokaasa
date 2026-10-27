import { z } from 'zod';

export const ROOM_CATEGORY_OPTIONS = [
  { value: 'STANDARD', label: 'Standard' },
  { value: 'DELUXE', label: 'Deluxe' },
  { value: 'SUITE', label: 'Suite' },
  { value: 'FAMILY', label: 'Family' },
  { value: 'VILLA', label: 'Villa' },
  { value: 'DORM', label: 'Dormitory' },
  { value: 'OTHER', label: 'Other' },
];

export const BED_TYPE_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: 'KING', label: 'King' },
  { value: 'QUEEN', label: 'Queen' },
  { value: 'DOUBLE', label: 'Double' },
  { value: 'TWIN', label: 'Twin' },
  { value: 'SINGLE', label: 'Single' },
  { value: 'SOFA_BED', label: 'Sofa bed' },
  { value: 'BUNK', label: 'Bunk' },
];

export const MEAL_PLAN_OPTIONS = [
  { value: 'ROOM_ONLY', label: 'Room only' },
  { value: 'BREAKFAST', label: 'Breakfast included' },
  { value: 'HALF_BOARD', label: 'Half board' },
  { value: 'FULL_BOARD', label: 'Full board' },
];

const text = (max) => z.string().trim().max(max, `Use at most ${max} characters`);
const whole = (min, max, label) =>
  z.string().trim().refine((v) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max, `${label} must be a whole number from ${min} to ${max}`);

/**
 * Mirrors backend/src/validators/inventory.validator.js. Inputs are strings from the form; `toRoomPayload`
 * converts them. The server re-validates everything and stays authoritative.
 */
export const roomFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Room name is required').max(120),
    roomCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,19}$/, 'Use 2-20 letters, digits, hyphens or underscores'),
    category: z.enum(['STANDARD', 'DELUXE', 'SUITE', 'FAMILY', 'VILLA', 'DORM', 'OTHER']),
    description: text(2000),
    roomSizeSqm: z.string().trim().refine((v) => v === '' || (Number(v) > 0 && Number(v) <= 2000), 'Enter a size in square metres'),
    bedType: z.string(),
    bedCount: whole(1, 10, 'Number of beds'),
    maxAdults: whole(1, 20, 'Maximum adults'),
    maxChildren: whole(0, 20, 'Maximum children'),
    maxOccupancy: whole(1, 30, 'Maximum occupancy'),
    view: text(60),
    smoking: z.enum(['SMOKING', 'NON_SMOKING']),
    totalUnits: whole(0, 500, 'Number of rooms'),
    cancellationPolicyId: z.string(),
    status: z.enum(['ACTIVE', 'INACTIVE']),
  })
  .superRefine((values, ctx) => {
    const occupancy = Number(values.maxOccupancy);
    const adults = Number(values.maxAdults);
    const children = Number(values.maxChildren);
    if (/^\d+$/.test(values.maxOccupancy) && /^\d+$/.test(values.maxAdults) && /^\d+$/.test(values.maxChildren)) {
      if (occupancy < adults || occupancy > adults + children) {
        ctx.addIssue({ code: 'custom', path: ['maxOccupancy'], message: `Use a value from ${adults} to ${adults + children}` });
      }
    }
  });

export const EMPTY_ROOM_FORM = {
  name: '',
  roomCode: '',
  category: 'DELUXE',
  description: '',
  roomSizeSqm: '',
  bedType: 'KING',
  bedCount: '1',
  maxAdults: '2',
  maxChildren: '0',
  maxOccupancy: '2',
  view: '',
  smoking: 'NON_SMOKING',
  totalUnits: '1',
  cancellationPolicyId: '',
  status: 'ACTIVE',
};

export function toRoomFormValues(room) {
  const str = (v) => (v == null ? '' : String(v));
  return {
    name: str(room.name),
    roomCode: str(room.roomCode),
    category: room.category,
    description: str(room.description),
    roomSizeSqm: str(room.roomSizeSqm),
    bedType: str(room.bedType),
    bedCount: str(room.bedCount),
    maxAdults: str(room.maxAdults),
    maxChildren: str(room.maxChildren),
    maxOccupancy: str(room.maxOccupancy),
    view: str(room.view),
    smoking: room.smoking,
    totalUnits: str(room.totalUnits),
    cancellationPolicyId: str(room.cancellationPolicyId),
    status: room.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
  };
}

export function toRoomPayload(values, { includeRoomCode = true } = {}) {
  const nullable = (v) => (v === '' ? null : v);
  const payload = {
    name: values.name,
    category: values.category,
    description: nullable(values.description),
    roomSizeSqm: values.roomSizeSqm === '' ? null : Number(values.roomSizeSqm),
    bedType: nullable(values.bedType),
    bedCount: Number(values.bedCount),
    maxAdults: Number(values.maxAdults),
    maxChildren: Number(values.maxChildren),
    maxOccupancy: Number(values.maxOccupancy),
    view: nullable(values.view),
    smoking: values.smoking,
    totalUnits: Number(values.totalUnits),
    cancellationPolicyId: values.cancellationPolicyId === '' ? null : Number(values.cancellationPolicyId),
    status: values.status,
  };
  if (includeRoomCode) payload.roomCode = values.roomCode;
  return payload;
}

/** Rupees (as typed) to integer paise. Rejects anything that is not a plain positive amount. */
export function rupeesToMinor(value) {
  const cleaned = String(value ?? '').replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export function minorToRupees(minor) {
  return minor == null ? '' : String(minor / 100);
}

/** The refundable/policy consistency rule is enforced by the server and shown as a field error on save. */
export const ratePlanFormSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Use letters, digits and underscores'),
  name: z.string().trim().min(2, 'Name is required').max(120),
  description: text(1000),
  mealPlan: z.enum(['ROOM_ONLY', 'BREAKFAST', 'HALF_BOARD', 'FULL_BOARD']),
  isRefundable: z.boolean(),
  cancellationPolicyId: z.string().min(1, 'Choose a cancellation policy'),
  discountPercent: z.string().trim().refine((v) => v !== '' && Number(v) >= 0 && Number(v) <= 100, 'Enter 0 to 100'),
  taxPercent: z.string().trim().refine((v) => v !== '' && Number(v) >= 0 && Number(v) <= 100, 'Enter 0 to 100'),
  feeRupees: z.string().trim().refine((v) => v === '' || rupeesToMinor(v) !== null, 'Enter an amount such as 150 or 150.50'),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export const EMPTY_RATE_PLAN_FORM = {
  code: '', name: '', description: '', mealPlan: 'ROOM_ONLY', isRefundable: true, cancellationPolicyId: '',
  discountPercent: '0', taxPercent: '12', feeRupees: '0', status: 'ACTIVE',
};

export function toRatePlanPayload(values) {
  return {
    code: values.code,
    name: values.name,
    description: values.description === '' ? null : values.description,
    mealPlan: values.mealPlan,
    isRefundable: values.isRefundable,
    cancellationPolicyId: Number(values.cancellationPolicyId),
    discountPercent: Number(values.discountPercent),
    taxPercent: Number(values.taxPercent),
    feeMinor: values.feeRupees === '' ? 0 : rupeesToMinor(values.feeRupees),
    status: values.status,
  };
}
