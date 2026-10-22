import rateLimit from 'express-rate-limit';

const JSON_MESSAGE = { error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } };

// Limits are bypassed only under NODE_ENV=test, so the integration suite can exercise many logins quickly.
const skipInTests = () => process.env.NODE_ENV === 'test';

const common = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: JSON_MESSAGE,
  skip: skipInTests,
};

/** Global guard for every API route. */
export const apiLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 600,
});

/** Login, register, forgot and reset are the brute-force and enumeration targets. */
export const authLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: false,
});

/** External provider search is paid and rate-limited upstream, so keep admins from hammering it. */
export const importSearchLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 20,
});

/** The AI natural-language assistant is a paid, public, per-message call -- a tighter window than general search. */
export const aiAssistantLimiter = rateLimit({
  ...common,
  windowMs: 10 * 60 * 1000,
  limit: 15,
});

/** Presence session/heartbeat/end. A tab heartbeats roughly every 30s, so generous headroom for retries and multiple tabs without allowing a runaway loop. */
export const presenceLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 20,
});
