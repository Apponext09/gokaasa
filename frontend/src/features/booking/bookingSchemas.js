import { z } from 'zod';

/**
 * Guest details form rules. These mirror the server's rules (validators/booking.validator.js) so most mistakes are
 * caught before a request is sent. The server still checks everything; nothing here is trusted.
 */
export const ADULT_AGE = 18;

const personName = (label) => z.string().trim().min(1, `${label} is required`).max(60, `${label} must be at most 60 characters`);

const optionalAge = z.preprocess(
  (value) => (value === '' || value == null ? undefined : Number(value)),
  z
    .number({ error: 'Enter the age of each guest' })
    .int('Age must be a whole number')
    .min(0, 'Age must be 0 or more')
    .max(120, 'Age must be 120 or less'),
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

const guestSchema = z.object({
  firstName: personName('First name'),
  lastName: personName('Last name'),
  age: optionalAge,
});

/**
 * Builds the form schema for one stay. Each room must have exactly the adults and children the search asked for:
 * guests aged under 18 count as children, everyone else as adults.
 */
export function buildGuestFormSchema(occupancy) {
  return z
    .object({
      primaryContact: primaryContactSchema,
      rooms: z.array(z.object({ guests: z.array(guestSchema) })),
      gstNumber: z
        .string()
        .trim()
        .toUpperCase()
        .refine((value) => value === '' || /^[0-9A-Z]{15}$/.test(value), 'GST numbers have 15 characters'),
      companyName: z.string().trim().max(120, 'Company name must be at most 120 characters'),
      specialRequest: z.string().trim().max(500, 'Keep special requests to 500 characters or fewer'),
    })
    .superRefine((value, ctx) => {
      occupancy.forEach((expected, roomIndex) => {
        const guests = value.rooms[roomIndex]?.guests ?? [];
        const children = guests.filter((guest) => guest.age !== undefined && guest.age < ADULT_AGE).length;
        const adults = guests.length - children;
        if (adults !== expected.adults || children !== expected.childAges.length) {
          ctx.addIssue({
            code: 'custom',
            path: ['rooms', roomIndex, 'guests'],
            message: `Room ${roomIndex + 1} needs ${expected.adults} adult${expected.adults === 1 ? '' : 's'} and ${expected.childAges.length} child${expected.childAges.length === 1 ? '' : 'ren'}. Check the ages.`,
          });
        }
      });
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
    specialRequest: saved?.specialRequest ?? '',
  };
}

/** The request body for PUT /api/booking/holds/:id/guests. */
export function toGuestDetailsPayload(values) {
  return {
    primaryContact: { ...values.primaryContact },
    rooms: values.rooms.map((room, roomIndex) => ({
      roomIndex,
      guests: room.guests.map((guest) => ({
        firstName: guest.firstName.trim(),
        lastName: guest.lastName.trim(),
        age: Number(guest.age),
      })),
    })),
    gstNumber: values.gstNumber || undefined,
    companyName: values.companyName || undefined,
    specialRequest: values.specialRequest || undefined,
  };
}
