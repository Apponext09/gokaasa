import { z } from 'zod';

const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters`);

const optionalNumber = (min, max, label) =>
  z
    .string()
    .trim()
    .refine((value) => value === '' || (!Number.isNaN(Number(value)) && Number(value) >= min && Number(value) <= max), `${label} must be between ${min} and ${max}`);

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
  latitude: optionalNumber(-90, 90, 'Latitude'),
  longitude: optionalNumber(-180, 180, 'Longitude'),
  phone: optionalText(20).refine((value) => value === '' || /^\+?[0-9 ()-]{7,20}$/.test(value), 'Enter a valid phone number'),
  email: z.string().trim().refine((value) => value === '' || z.email().safeParse(value).success, 'Enter a valid email address'),
  website: z.string().trim().refine((value) => value === '' || z.url().safeParse(value).success, 'Enter a full URL, including https://'),
  checkInTime: z.string(),
  checkOutTime: z.string(),
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
  latitude: '',
  longitude: '',
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
    latitude: str(hotel.latitude),
    longitude: str(hotel.longitude),
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
  const number = (value) => (value === '' ? null : Number(value));
  return {
    name: values.name,
    shortName: nullable(values.shortName),
    description: nullable(values.description),
    propertyType: values.propertyType,
    starRating: number(values.starRating),
    addressLine: nullable(values.addressLine),
    area: nullable(values.area),
    city: values.city,
    state: nullable(values.state),
    countryCode: values.countryCode,
    postalCode: nullable(values.postalCode),
    latitude: number(values.latitude),
    longitude: number(values.longitude),
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
  latitude: 'Latitude',
  longitude: 'Longitude',
  phone: 'Phone',
  email: 'Email',
  website: 'Website',
  checkInTime: 'Check-in time',
  checkOutTime: 'Check-out time',
};

/** Fields shown on each workspace tab. The same form instance backs every tab. */
export const TAB_FIELDS = {
  overview: ['name', 'shortName', 'propertyType', 'starRating', 'description', 'phone', 'email', 'website', 'checkInTime', 'checkOutTime'],
  location: ['addressLine', 'area', 'city', 'state', 'countryCode', 'postalCode', 'latitude', 'longitude'],
};
