import { z } from 'zod';

// Normalise before validating so "  Asha@Example.com " is accepted and stored as "asha@example.com".
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

const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number')
  .optional()
  .or(z.literal('').transform(() => undefined));

export const registerSchema = z.object({
  email,
  password,
  firstName: name('First name'),
  lastName: name('Last name'),
  phone,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(128),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password,
});
