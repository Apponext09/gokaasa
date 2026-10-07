import { z } from 'zod';

/*
 * Client-side mirror of backend/src/validators/auth.validator.js. These give instant feedback only;
 * the API re-validates everything and remains the source of truth.
 */
export const emailField = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Enter a valid email address')
  .max(254);

export const passwordField = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters')
  .regex(/[a-zA-Z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

const nameField = (label) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(80, `${label} must be at most 80 characters`)
    .regex(/^[\p{L}\p{M}' .-]+$/u, `${label} contains invalid characters`);

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z
  .object({
    firstName: nameField('First name'),
    lastName: nameField('Last name'),
    email: emailField,
    phone: z
      .string()
      .trim()
      .refine((value) => value === '' || /^\+?[0-9 ()-]{7,20}$/.test(value), 'Enter a valid phone number'),
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export const forgotPasswordSchema = z.object({ email: emailField });

export const resetPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
