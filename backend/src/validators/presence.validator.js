import { z } from 'zod';

// A bare pathname only -- no origin, no query string, no fragment. The server re-normalizes it anyway,
// but rejecting anything obviously wrong here keeps bad input out of the normalizer entirely.
const routePath = z.string().trim().min(1).max(300).regex(/^\/[^\s?#]*$/, 'Must be a path starting with /').optional();

export const startSessionSchema = z.object({
  platform: z.enum(['web', 'android', 'ios']).default('web'),
  route: routePath,
});

export const heartbeatSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
  route: routePath,
});

export const endSessionSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
});
