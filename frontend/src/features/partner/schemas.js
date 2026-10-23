import { z } from 'zod';
import { emailField, passwordField } from '@/features/auth/schemas.js';

/* Client-side mirror of backend/src/validators/partner.validator.js -- instant feedback only, the API
   re-validates everything and remains the source of truth. */

const nameField = (label) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(80, `${label} must be at most 80 characters`)
    .regex(/^[\p{L}\p{M}' .-]+$/u, `${label} contains invalid characters`);

const mobileField = z
  .string()
  .trim()
  .refine((value) => /^\+?[0-9]{10,15}$/.test(value.replace(/[\s-]/g, '')), 'Enter a valid mobile number');

export const BUSINESS_TYPE_OPTIONS = [
  { value: 'INDIVIDUAL', label: 'Individual' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'PRIVATE_LIMITED', label: 'Private Limited Company' },
  { value: 'LLP', label: 'LLP' },
  { value: 'OTHER', label: 'Other' },
];

export const DOCUMENT_TYPE_OPTIONS = [
  { value: 'BUSINESS_REGISTRATION', label: 'Business registration' },
  { value: 'GOVERNMENT_ID', label: 'Government ID' },
  { value: 'PROPERTY_OWNERSHIP_OR_LEASE', label: 'Property ownership / lease' },
  { value: 'OTHER', label: 'Other' },
];

export const partnerRegisterSchema = z.object({
  firstName: nameField('First name'),
  lastName: nameField('Last name'),
  email: emailField,
  mobile: mobileField,
  password: passwordField,
  businessName: z.string().trim().min(1, 'Business name is required').max(200),
  businessType: z.enum(['INDIVIDUAL', 'PARTNERSHIP', 'PRIVATE_LIMITED', 'LLP', 'OTHER']),
  gstin: z.string().trim().max(15).optional(),
  pan: z.string().trim().max(10).optional(),
  propertyName: z.string().trim().min(1, 'Property name is required').max(200),
  propertyCity: z.string().trim().min(1, 'City is required').max(120),
  propertyAddress: z.string().trim().max(500).optional(),
  estimatedRooms: z
    .string()
    .trim()
    .refine((value) => value === '' || /^[0-9]+$/.test(value), 'Enter a whole number')
    .optional(),
});

export const otpRequestSchema = z.object({ email: emailField });

export const otpVerifySchema = z.object({
  email: emailField,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const partnerDecisionSchema = z.object({
  reason: z.string().trim().min(1, 'Provide a reason').max(500),
});
