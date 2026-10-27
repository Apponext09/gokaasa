import { z } from 'zod';

const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters`);

const optionalUrl = (label) => z.string().trim().max(1000).refine((value) => {
  if (value === '') return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, `Enter a valid ${label}, including https://`);

/** Form-level schema. Inputs are strings; `toPayload` converts them to API types. */
export const hotelFormSchema = z.object({
  name: z.string().trim().min(2, 'Hotel name is required').max(200),
  shortName: optionalText(60),
  description: optionalText(4000),
  propertyType: z.enum(['HOTEL', 'RESORT', 'VILLA', 'APARTMENT', 'HOSTEL', 'GUEST_HOUSE']),
  starRating: z.string(),
  addressLine: optionalText(300),
  area: optionalText(120),
  city: z.string().trim().min(2, 'City is required').max(100),
  state: optionalText(120),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Use a two-letter code such as IN'),
  postalCode: optionalText(20),
  locationUrl: optionalUrl('location URL'),
  phone: optionalText(20).refine((value) => value === '' || /^\+?[0-9 ()-]{7,20}$/.test(value), 'Enter a valid phone number'),
  email: z.string().trim().refine((value) => value === '' || z.email().safeParse(value).success, 'Enter a valid email address'),
  website: z.string().trim().refine((value) => value === '' || z.url().safeParse(value).success, 'Enter a full URL, including https://'),
  checkInTime: z.string().refine((value) => value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value), 'Use a valid time'),
  checkOutTime: z.string().refine((value) => value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value), 'Use a valid time'),
});

export const EMPTY_HOTEL_FORM = {
  name: '',
  shortName: '',
  description: '',
  propertyType: 'HOTEL',
  starRating: '',
  addressLine: '',
  area: '',
  city: '',
  state: '',
  countryCode: 'IN',
  postalCode: '',
  locationUrl: '',
  phone: '',
  email: '',
  website: '',
  checkInTime: '',
  checkOutTime: '',
};

/** API hotel -> form strings. */
export function toFormValues(hotel) {
  const str = (value) => (value == null ? '' : String(value));
  return {
    name: str(hotel.name),
    shortName: str(hotel.shortName),
    description: str(hotel.description),
    propertyType: hotel.propertyType ?? 'HOTEL',
    starRating: str(hotel.starRating),
    addressLine: str(hotel.addressLine),
    area: str(hotel.area),
    city: str(hotel.city),
    state: str(hotel.state),
    countryCode: str(hotel.countryCode),
    postalCode: str(hotel.postalCode),
    locationUrl: str(hotel.locationUrl),
    phone: str(hotel.phone),
    email: str(hotel.email),
    website: str(hotel.website),
    checkInTime: hotel.checkInTime ? String(hotel.checkInTime).slice(0, 5) : '',
    checkOutTime: hotel.checkOutTime ? String(hotel.checkOutTime).slice(0, 5) : '',
  };
}

/** Form strings -> API payload. Empty strings become null so the API can clear a field. */
export function toPayload(values) {
  const nullable = (value) => (value === '' ? null : value);
  return {
    name: values.name,
    shortName: nullable(values.shortName),
    description: nullable(values.description),
    propertyType: values.propertyType,
    starRating: values.starRating === '' ? null : Number(values.starRating),
    addressLine: nullable(values.addressLine),
    area: nullable(values.area),
    city: values.city,
    state: nullable(values.state),
    countryCode: values.countryCode,
    postalCode: nullable(values.postalCode),
    locationUrl: nullable(values.locationUrl),
    phone: nullable(values.phone),
    email: nullable(values.email),
    website: nullable(values.website),
    checkInTime: nullable(values.checkInTime),
    checkOutTime: nullable(values.checkOutTime),
  };
}

export const FIELD_LABELS = {
  name: 'Hotel name',
  shortName: 'Short name',
  description: 'Description',
  propertyType: 'Property type',
  starRating: 'Star rating',
  addressLine: 'Address',
  area: 'Area',
  city: 'City',
  state: 'State / region',
  countryCode: 'Country code',
  postalCode: 'Postal code',
  locationUrl: 'Location URL (Google Maps)',
  phone: 'Phone',
  email: 'Email',
  website: 'Website',
  checkInTime: 'Check-in time',
  checkOutTime: 'Check-out time',
};

/** Fields shown on each workspace tab. The same form instance backs every tab. */
export const TAB_FIELDS = {
  overview: ['name', 'shortName', 'propertyType', 'starRating', 'description', 'phone', 'email', 'website', 'checkInTime', 'checkOutTime'],
  location: ['addressLine', 'area', 'city', 'state', 'countryCode', 'postalCode', 'locationUrl'],
};
