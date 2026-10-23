import { z } from 'zod';

// Mirrors auth.validator.js's email/password/name rules exactly -- a partner account is still a normal
// `users` row, just with role HOTEL_OWNER instead of CUSTOMER.
const email = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  z.email({ message: 'Enter a valid email address' }).max(254),
);

const password = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-zA-Z]/, 'Password must include a letter')
  .regex(/[0-9]/, 'Password must include a number');

const name = (label) =>
  z
    .string({ message: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(80, `${label} must be at most 80 characters`)
    .regex(/^[\p{L}\p{M}' .-]+$/u, `${label} contains invalid characters`);

const mobile = z.preprocess(
  (value) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') : value),
  z.string().regex(/^\+?[0-9]{10,15}$/, 'Enter a valid mobile number'),
);

const BUSINESS_TYPES = ['INDIVIDUAL', 'PARTNERSHIP', 'PRIVATE_LIMITED', 'LLP', 'OTHER'];
const DOC_TYPES = ['BUSINESS_REGISTRATION', 'GOVERNMENT_ID', 'PROPERTY_OWNERSHIP_OR_LEASE', 'OTHER'];

export const partnerRegisterSchema = z.object({
  // Account
  email,
  password,
  firstName: name('First name'),
  lastName: name('Last name'),
  mobile,
  // Business
  businessName: z.string().trim().min(1, 'Business name is required').max(200),
  businessType: z.enum(BUSINESS_TYPES),
  gstin: z.string().trim().max(15).optional().transform((value) => value || undefined),
  pan: z.string().trim().max(10).optional().transform((value) => value || undefined),
  // Property
  propertyName: z.string().trim().min(1, 'Property name is required').max(200),
  propertyCity: z.string().trim().min(1, 'City is required').max(120),
  propertyAddress: z.string().trim().max(500).optional(),
  estimatedRooms: z.coerce.number().int().positive().optional(),
});

export const otpRequestSchema = z.object({ email });

export const otpVerifySchema = z.object({
  email,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const documentUploadFields = z.object({
  docType: z.enum(DOC_TYPES),
});

export const partnerDecisionSchema = z.object({
  reason: z.string().trim().min(1, 'Provide a reason').max(500).optional(),
});

export const partnerApplicationListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED']).optional(),
});

export const partnerUserIdParam = z.object({
  userId: z.coerce.number().int().positive(),
});

export const partnerDocumentParam = z.object({
  userId: z.coerce.number().int().positive(),
  docId: z.coerce.number().int().positive(),
});

export const ownDocumentParam = z.object({
  docId: z.coerce.number().int().positive(),
});
