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

/** Partner self-registration: same brute-force/enumeration exposure as authLimiter, same limits. */
export const partnerRegisterLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: false,
});

/** OTP resend/verify: a 6-digit code is only safe against brute force if attempts are also capped
 * per-code (see otpService.js) -- this just bounds how many codes/guesses one IP can burn through. */
export const otpLimiter = rateLimit({
  ...common,
  windowMs: 10 * 60 * 1000,
  limit: 10,
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
