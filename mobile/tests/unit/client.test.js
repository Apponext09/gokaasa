import { normalizeError, resolveBaseUrl, PRODUCTION_API_URL } from '../../src/api/client.js';

describe('resolveBaseUrl (Phase 7/8: API configuration validation)', () => {
  test('uses a well-formed EXPO_PUBLIC_API_URL as-is', () => {
    expect(resolveBaseUrl('https://gokaasa.apponext.in/api')).toBe('https://gokaasa.apponext.in/api');
  });

  test('strips a trailing slash', () => {
    expect(resolveBaseUrl('https://gokaasa.apponext.in/api/')).toBe('https://gokaasa.apponext.in/api');
  });

  test('falls back to production when the env var is missing', () => {
    expect(resolveBaseUrl(undefined)).toBe(PRODUCTION_API_URL);
    expect(resolveBaseUrl('')).toBe(PRODUCTION_API_URL);
    expect(resolveBaseUrl('   ')).toBe(PRODUCTION_API_URL);
  });

  test('falls back to production for a non-http(s) value instead of silently using it', () => {
    expect(resolveBaseUrl('not-a-url')).toBe(PRODUCTION_API_URL);
    expect(resolveBaseUrl('ftp://example.com/api')).toBe(PRODUCTION_API_URL);
  });

  test('never produces a double "/api/api" suffix', () => {
    expect(resolveBaseUrl('https://gokaasa.apponext.in/api/api')).toBe('https://gokaasa.apponext.in/api');
  });

  test('never resolves to a dev-only address (10.0.2.2/localhost/127.0.0.1) unless explicitly configured to', () => {
    // Explicit dev config is honored (this app running against a developer's own local backend) --
    // the point of resolveBaseUrl is to never resolve a *missing or malformed* value to a dev address.
    expect(resolveBaseUrl('http://10.0.2.2:4000/api')).toBe('http://10.0.2.2:4000/api');
    // But a missing/invalid value is NEVER silently turned into one.
    expect(resolveBaseUrl(undefined)).not.toMatch(/10\.0\.2\.2|127\.0\.0\.1|localhost/);
  });
});

describe('normalizeError (Phase 8: API error handling)', () => {
  /**
   * Regression test: a deliberately cancelled request (AbortController, e.g. SearchScreen cancelling a
   * stale search/autocomplete call) has isAxiosError=true and no `.response`, so without an explicit
   * check it fell through to the generic NETWORK branch below -- wrongly showing "We could not reach
   * Gokaasa" for something that was never actually a failure. Verified live: a real axios request
   * aborted via AbortController throws { isAxiosError: true, code: 'ERR_CANCELED', response: undefined }.
   */
  test('distinguishes a deliberately cancelled request (CANCELED) from a real network failure (NETWORK)', () => {
    const result = normalizeError({ isAxiosError: true, code: 'ERR_CANCELED', response: undefined });
    expect(result.code).toBe('CANCELED');
    expect(result.status).toBe(0);
  });

  test('maps an aborted/timed-out request to a TIMEOUT code with a friendly message', () => {
    const result = normalizeError({ code: 'ECONNABORTED' });
    expect(result).toMatchObject({ status: 0, code: 'TIMEOUT', message: 'The request took too long. Please try again.', fieldErrors: {} });
  });

  test('maps a non-axios (programmer) error to a generic CLIENT code', () => {
    const result = normalizeError(new Error('boom'));
    expect(result.code).toBe('CLIENT');
    expect(result.status).toBe(0);
  });

  test('maps a request that never got a response to NETWORK', () => {
    const result = normalizeError({ isAxiosError: true, response: undefined });
    expect(result).toMatchObject({ status: 0, code: 'NETWORK', message: 'We could not reach Gokaasa. Check your connection and try again.', fieldErrors: {} });
  });

  test('extracts the real server message, code, and status for a real HTTP error response', () => {
    const axiosLikeError = {
      isAxiosError: true,
      response: {
        status: 401,
        data: { error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } },
      },
    };
    const result = normalizeError(axiosLikeError);
    expect(result).toMatchObject({ status: 401, code: 'UNAUTHORIZED', message: 'Invalid email or password', fieldErrors: {} });
  });

  test('carries a plain-object `details` through unchanged (regression: a business sub-code like PAYMENT_MISMATCH/ALREADY_PAID was silently dropped before)', () => {
    // AppError.conflict(message, { code: 'ALREADY_PAID' }) serializes to this exact shape
    // (backend/src/middleware/errorHandler.js: `details: error.details`) -- the generic top-level `code`
    // stays CONFLICT for every payment conflict; only `details.code` tells them apart. PaymentScreen.js
    // reads `error.details?.code` for exactly this reason (matches the website's identical check).
    const axiosLikeError = {
      isAxiosError: true,
      response: {
        status: 409,
        data: { error: { code: 'CONFLICT', message: 'This booking is already paid and confirmed.', details: { code: 'ALREADY_PAID' } } },
      },
    };
    const result = normalizeError(axiosLikeError);
    expect(result.code).toBe('CONFLICT');
    expect(result.details).toEqual({ code: 'ALREADY_PAID' });
  });

  test('a validation-error response (details is an array) still fills fieldErrors, and details itself is also carried through', () => {
    const axiosLikeError = {
      isAxiosError: true,
      response: {
        status: 422,
        data: { error: { code: 'UNPROCESSABLE', message: 'Fix the highlighted fields', details: [{ field: 'checkIn', message: 'Required' }] } },
      },
    };
    const result = normalizeError(axiosLikeError);
    expect(result.fieldErrors).toEqual({ checkIn: 'Required' });
    expect(result.details).toEqual([{ field: 'checkIn', message: 'Required' }]);
  });

  test('builds a fieldErrors map keyed by each validation detail\'s field path, taking the first message per field', () => {
    const axiosLikeError = {
      isAxiosError: true,
      response: {
        status: 422,
        data: {
          error: {
            code: 'UNPROCESSABLE',
            message: 'Please correct the highlighted fields',
            details: [
              { field: 'body.email', message: 'Enter a valid email address' },
              { field: 'body.password', message: 'Password must be at least 10 characters' },
              { field: 'body.password', message: 'Password must include a number' },
            ],
          },
        },
      },
    };
    const result = normalizeError(axiosLikeError);
    expect(result.fieldErrors).toEqual({
      'body.email': 'Enter a valid email address',
      // The second detail for the same field is dropped -- only the first message per field is kept.
      'body.password': 'Password must be at least 10 characters',
    });
  });

  /**
   * Regression test for a real, confirmed bug: the shared response interceptor in client.js already
   * normalizes every rejected request before it reaches a screen's `catch` block, so every screen was
   * receiving an ALREADY-normalized error. Several screens called normalizeError(err) a second time,
   * which discarded the real server message (e.g. "Invalid email or password") in favour of the generic
   * "Something went wrong" CLIENT fallback -- verified live against production with a wrong-password
   * login before this was fixed. normalizeError must now be idempotent: calling it twice must return the
   * exact same result as calling it once.
   */
  test('is idempotent -- calling it twice never discards the real message (regression test)', () => {
    const axiosLikeError = {
      isAxiosError: true,
      response: { status: 401, data: { error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } } },
    };
    const once = normalizeError(axiosLikeError);
    const twice = normalizeError(once);
    expect(twice).toEqual(once);
    expect(twice.message).toBe('Invalid email or password');
    expect(twice.code).toBe('UNAUTHORIZED');
  });

  test('idempotency also holds for the TIMEOUT/CLIENT/NETWORK fallback shapes, not just real server responses', () => {
    const network = normalizeError({ isAxiosError: true, response: undefined });
    expect(normalizeError(network)).toEqual(network);

    const timeout = normalizeError({ code: 'ECONNABORTED' });
    expect(normalizeError(timeout)).toEqual(timeout);
  });
});
