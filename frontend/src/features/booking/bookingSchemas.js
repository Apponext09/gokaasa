import { z } from 'zod';

/**
 * Guest details form rules. These mirror the server's rules (validators/booking.validator.js) so most mistakes are
 * caught before a request is sent. The server still checks everything; nothing here is trusted.
 */
export const ADULT_AGE = 18;

const personName = (label) => z.string().trim().min(1, `${label} is required`).max(60, `${label} must be at most 60 characters`);

// Genuinely optional: left blank, a guest's age is simply not provided yet (collected at check-in).
const optionalAge = z.preprocess(
  (value) => (value === '' || value == null ? undefined : Number(value)),
  z
    .number()
    .int('Age must be a whole number')
    .min(0, 'Age must be 0 or more')
    .max(120, 'Age must be 120 or less')
    .optional(),
);

export const primaryContactSchema = z.object({
  firstName: personName('First name'),
  lastName: personName('Last name'),
  email: z.preprocess((value) => (typeof value === 'string' ? value.trim().toLowerCase() : value), z.email('Enter a valid email address')),
  mobile: z.preprocess(
    (value) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') : value),
    z.string().regex(/^\+?[0-9]{10,15}$/, 'Enter a valid mobile number, with country code if outside India'),
  ),
});

// Beyond the required lead guest above (primaryContact), naming each room occupant is optional -- the
// hotel can collect whatever is missing at check-in. A name is still all-or-nothing when given: a first
// name with no last name is ambiguous, not "not provided yet", so that pairing is still enforced.
const guestSchema = z
  .object({
    firstName: z.string().trim().max(60, 'First name must be at most 60 characters'),
    lastName: z.string().trim().max(60, 'Last name must be at most 60 characters'),
    age: optionalAge,
  })
  .refine((value) => Boolean(value.firstName) === Boolean(value.lastName), {
    message: 'Enter both first and last name, or leave both blank to add this guest at check-in',
    path: ['lastName'],
  });

/** Builds the form schema for one stay. Occupancy itself (adults/children per room) was already fixed when the room was selected; this form never changes or re-validates it. */
export function buildGuestFormSchema() {
  return z.object({
    primaryContact: primaryContactSchema,
    rooms: z.array(z.object({ guests: z.array(guestSchema) })),
    gstNumber: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => value === '' || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value), 'Enter a valid 15-character GSTIN'),
    companyName: z.string().trim().max(120, 'Company name must be at most 120 characters'),
    billingAddress: z.string().trim().max(300, 'Keep the billing address to 300 characters or fewer'),
    specialRequest: z.string().trim().max(500, 'Keep special requests to 500 characters or fewer'),
  });
}

/**
 * Starting values. Children's ages come from the search; adults' ages are left for the guest to fill in.
 * When a saved draft exists (the guest came back to this page), it is used instead.
 */
export function defaultGuestValues(occupancy, saved = null) {
  const savedRooms = saved?.rooms ?? [];
  return {
    primaryContact: {
      firstName: saved?.primaryContact?.firstName ?? '',
      lastName: saved?.primaryContact?.lastName ?? '',
      email: saved?.primaryContact?.email ?? '',
      mobile: saved?.primaryContact?.mobile ?? '',
    },
    rooms: occupancy.map((room, roomIndex) => {
      const slots = [
        ...Array.from({ length: room.adults }, () => ({ firstName: '', lastName: '', age: '' })),
        ...room.childAges.map((age) => ({ firstName: '', lastName: '', age: String(age) })),
      ];
      return {
        guests: slots.map((slot, index) => {
          const previous = savedRooms[roomIndex]?.guests?.[index];
          return previous
            ? { firstName: previous.firstName ?? '', lastName: previous.lastName ?? '', age: String(previous.age ?? '') }
            : slot;
        }),
      };
    }),
    gstNumber: saved?.gstNumber ?? '',
    companyName: saved?.companyName ?? '',
    billingAddress: saved?.billingAddress ?? '',
    specialRequest: saved?.specialRequest ?? '',
  };
}

/**
 * The request body for PUT /api/booking/holds/:id/guests. A slot the guest left entirely blank is
 * dropped rather than sent as an empty-named guest -- it is genuinely not provided, not "Guest 2"/"Unknown".
 */
export function toGuestDetailsPayload(values) {
  return {
    primaryContact: { ...values.primaryContact },
    rooms: values.rooms.map((room, roomIndex) => ({
      roomIndex,
      guests: room.guests
        .filter((guest) => guest.firstName.trim() && guest.lastName.trim())
        .map((guest) => ({
          firstName: guest.firstName.trim(),
          lastName: guest.lastName.trim(),
          ...(guest.age !== undefined && guest.age !== '' ? { age: Number(guest.age) } : {}),
        })),
    })),
    gstNumber: values.gstNumber || undefined,
    companyName: values.companyName || undefined,
    billingAddress: values.billingAddress || undefined,
    specialRequest: values.specialRequest || undefined,
  };
}
