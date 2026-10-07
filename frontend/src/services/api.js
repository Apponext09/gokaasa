import axios from 'axios';

/**
 * The access token lives in memory only, never in localStorage, so an XSS payload cannot read a
 * long-lived credential. The refresh token is an httpOnly cookie the browser sends automatically.
 */
let accessToken = null;

export const tokenStore = {
  get: () => accessToken,
  set: (token) => {
    accessToken = token;
  },
  clear: () => {
    accessToken = null;
  },
};

export const SESSION_EXPIRED_EVENT = 'gokaasa:session-expired';

export const api = axios.create({
  baseURL: '/api',
  timeout: 20_000,
  withCredentials: true,
  headers: { Accept: 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshInFlight = null;

/**
 * Exchanges the refresh cookie for a new access token. Concurrent callers (parallel 401s, or React
 * StrictMode running effects twice) share one request, so a rotating token is never presented twice.
 */
export function refreshAccessToken() {
  refreshInFlight ??= axios
    .post('/api/auth/refresh', null, { withCredentials: true, timeout: 15_000 })
    .then(({ data }) => {
      tokenStore.set(data.accessToken);
      return data;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const isAuthCall = original?.url?.startsWith('/auth/');

    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        const { accessToken } = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch {
        tokenStore.clear();
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      }
    }
    return Promise.reject(normalizeError(error));
  },
);

/**
 * Converts any failure into `{ status, code, message, fieldErrors }`. Raw server responses are
 * never shown to users; the server already returns safe messages.
 */
export function normalizeError(error) {
  if (error?.code === 'ECONNABORTED') {
    return { status: 0, code: 'TIMEOUT', message: 'The request took too long. Please try again.', fieldErrors: {} };
  }
  if (!error?.isAxiosError) {
    // Not an HTTP failure, so this is a bug in the calling code. Keep the message generic for users.
    console.error(error);
    return { status: 0, code: 'CLIENT', message: 'Something went wrong on this page. Please try again.', fieldErrors: {} };
  }
  if (!error.response) {
    return { status: 0, code: 'NETWORK', message: 'We could not reach Gokaasa. Check your connection and try again.', fieldErrors: {} };
  }
  const { status, data } = error.response;
  const body = data?.error ?? {};
  const fieldErrors = {};
  // Validation errors are a list of field issues; business errors carry a plain object (e.g. { code }).
  for (const detail of Array.isArray(body.details) ? body.details : []) {
    if (Array.isArray(detail)) continue;
    if (detail.field && !fieldErrors[detail.field]) fieldErrors[detail.field] = detail.message;
  }
  return {
    status,
    code: body.code ?? 'ERROR',
    message: body.message ?? 'Something went wrong. Please try again.',
    fieldErrors,
    details: body.details,
  };
}

/** Maps server field paths such as "body.email" onto react-hook-form field names. */
export function applyServerFieldErrors(form, error) {
  let applied = false;
  for (const [path, message] of Object.entries(error.fieldErrors ?? {})) {
    const field = path.replace(/^body\./, '');
    if (form.getValues(field) !== undefined) {
      form.setError(field, { type: 'server', message });
      applied = true;
    }
  }
  return applied;
}
