import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

/**
 * The backend (backend/src/controllers/auth.controller.js) issues a short-lived (15 min) bearer access
 * token in the JSON body, plus a long-lived httpOnly refresh cookie (gk_refresh, Strict, 30 days,
 * path=/api/auth). The access token is easy to handle on mobile: it is stored here and attached as an
 * Authorization header. The refresh cookie is harder -- it is httpOnly, so no JavaScript on any platform
 * (web or native) can ever read its value, by design, and this app must not try to circumvent that.
 *
 * KNOWN LIMITATION (see mobile/README.md "Known limitations"): React Native's own documentation
 * describes cookie-based auth as unstable, and persisting a cookie across app restarts needs either the
 * native platform's own cookie store to retain it (not guaranteed, and NOT verified end-to-end in this
 * environment -- that requires a real device/emulator session) or an extra native cookie-manager module
 * (which would need a custom dev build, not Expo Go). This file does the best-effort standard thing
 * (axios withCredentials) and degrades safely: if a silent refresh fails, the user is simply asked to log
 * in again -- never a crash, never a silently-broken authenticated state.
 */

const ACCESS_TOKEN_KEY = 'gokaasa_access_token';
const USER_KEY = 'gokaasa_user';

/** The live Gokaasa backend (Nginx-fronted over HTTPS; the app never talks to the private :5015 port
 * directly). This is the safe fallback -- used only if EXPO_PUBLIC_API_URL is missing or malformed, which
 * should never happen in a real build but must never silently resolve to a dev-only address either. */
export const PRODUCTION_API_URL = 'https://gokaasa.apponext.in/api';

/** Validates EXPO_PUBLIC_API_URL instead of trusting it blindly: rejects anything that isn't a real
 * http(s) URL, strips a trailing slash, and fixes an accidentally duplicated "/api/api" suffix (a common
 * copy-paste mistake when the base URL itself already ends in "/api"). Takes `raw` as a parameter
 * (rather than reading `process.env` internally) so it's a pure, directly unit-testable function --
 * see tests/unit/client.test.js. */
export function resolveBaseUrl(raw) {
  if (!raw || typeof raw !== 'string' || raw.trim() === '') {
    console.warn('[gokaasa] EXPO_PUBLIC_API_URL is not set -- falling back to the production API URL.');
    return PRODUCTION_API_URL;
  }
  let url = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) {
    console.warn(`[gokaasa] EXPO_PUBLIC_API_URL ("${url}") is not a valid http(s) URL -- falling back to the production API URL.`);
    return PRODUCTION_API_URL;
  }
  if (/\/api\/api$/i.test(url)) {
    console.warn(`[gokaasa] EXPO_PUBLIC_API_URL ("${url}") duplicates "/api" -- using "${url.replace(/\/api$/i, '')}" instead.`);
    url = url.replace(/\/api$/i, '');
  }
  return url;
}

const baseURL = resolveBaseUrl(process.env.EXPO_PUBLIC_API_URL);

export const api = axios.create({
  baseURL,
  timeout: 20_000,
  withCredentials: true,
  headers: { Accept: 'application/json' },
});

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

/** Called once, on app startup, before anything else renders -- restores the in-memory token from
 * SecureStore so a relaunch doesn't force a visible re-login flash for a session that's still valid. */
export async function loadStoredSession() {
  try {
    const [token, userJson] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(USER_KEY),
    ]);
    if (token) accessToken = token;
    return { token, user: userJson ? JSON.parse(userJson) : null };
  } catch {
    return { token: null, user: null };
  }
}

export async function persistSession(token, user) {
  accessToken = token;
  try {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  } catch {
    // Secure storage can be unavailable in rare cases; the in-memory token still works for this session.
  }
}

export async function clearSession() {
  accessToken = null;
  try {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  } catch {
    // Nothing to do if storage isn't available.
  }
}

export const SESSION_EXPIRED_EVENT = 'gokaasa:session-expired';
const listeners = new Set();
export function onSessionExpired(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emitSessionExpired() {
  listeners.forEach((fn) => fn());
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshInFlight = null;

/**
 * Exchanges the refresh cookie for a new access token. Concurrent callers (parallel 401s, or a fast
 * double-tap) share one in-flight request, so a rotating refresh token is never presented twice at once
 * (the exact race the backend's refresh-token rotation is designed to catch). Exported so AuthContext can
 * call it directly on app startup -- see the comment on that call site for why /auth/me must NOT be used
 * for that (it would never auto-refresh; see below). Never logs the token or the request/response body.
 */
export function refreshAccessToken() {
  refreshInFlight ??= axios
    .post(`${baseURL}/auth/refresh`, null, { withCredentials: true, timeout: 15_000 })
    .then(({ data }) => data)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    // Deliberately excludes EVERY /auth/* call, not just /auth/refresh -- a 401 from /auth/login means
    // wrong credentials (retrying via refresh would be nonsensical), and retrying /auth/refresh itself on
    // its own 401 would loop forever. The one cost of this blanket rule: a 401 from /auth/me is NOT
    // auto-refreshed either, so nothing in this app may rely on /auth/me to silently refresh an expired
    // token -- AuthContext's startup check calls refreshAccessToken() directly instead, exactly like the
    // website's own AuthContext.jsx does (it never calls /auth/me at all).
    const isAuthCall = original?.url?.startsWith('/auth/');

    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        const data = await refreshAccessToken();
        accessToken = data.accessToken;
        await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, data.accessToken).catch(() => {});
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        await clearSession();
        emitSessionExpired();
      }
    }
    return Promise.reject(normalizeError(error));
  },
);

/** Converts any failure into { status, code, message, fieldErrors }. The server's own safe message is
 * always preferred over a generic one -- mirrors the website's services/api.js#normalizeError exactly.
 *
 * Idempotent on purpose: every rejection from the shared `api` instance above is ALREADY normalized by
 * the response interceptor before it ever reaches a screen's `catch` block, so `err` there already has
 * this exact shape. Calling this function on that value a second time (a real bug found and fixed across
 * every screen in this app -- see git history) must return it unchanged rather than silently collapsing
 * a specific, useful server message into the generic CLIENT fallback below. The `NORMALIZED` marker is
 * how that's detected; it is not merged into any real error path's accidental shape.
 */
const NORMALIZED = Symbol.for('gokaasa.normalizedError');

function finish(normalized) {
  normalized[NORMALIZED] = true;
  return normalized;
}

export function normalizeError(error) {
  if (error?.[NORMALIZED]) return error;
  // A request a screen deliberately cancelled (AbortController, e.g. a stale search/autocomplete
  // request superseded by a newer one) must stay distinguishable from a real network failure -- without
  // this check it falls through to the "no response" branch below and gets mislabeled NETWORK, which
  // would show "We could not reach Gokaasa" for something that was never actually a failure.
  if (error?.code === 'ERR_CANCELED') {
    return finish({ status: 0, code: 'CANCELED', message: 'Request cancelled.', fieldErrors: {} });
  }
  if (error?.code === 'ECONNABORTED') {
    return finish({ status: 0, code: 'TIMEOUT', message: 'The request took too long. Please try again.', fieldErrors: {} });
  }
  if (!error?.isAxiosError) {
    return finish({ status: 0, code: 'CLIENT', message: 'Something went wrong. Please try again.', fieldErrors: {} });
  }
  if (!error.response) {
    return finish({ status: 0, code: 'NETWORK', message: 'We could not reach Gokaasa. Check your connection and try again.', fieldErrors: {} });
  }
  const { status, data } = error.response;
  const body = data?.error ?? {};
  const fieldErrors = {};
  for (const detail of Array.isArray(body.details) ? body.details : []) {
    if (Array.isArray(detail)) continue;
    if (detail.field && !fieldErrors[detail.field]) fieldErrors[detail.field] = detail.message;
  }
  return finish({
    status,
    code: body.code ?? 'ERROR',
    message: body.message ?? 'Something went wrong. Please try again.',
    fieldErrors,
    // The website's normalizeError (services/api.js) already carries this through; it was missing here.
    // AppError's business-specific sub-codes (e.g. payment's ALREADY_PAID/PRICE_CHANGED/HOLD_EXPIRED/
    // NOT_PAYABLE) travel as a plain object in `details` (errorHandler.js: `details: error.details`), not
    // inside the top-level `code`, which stays the generic CONFLICT/BAD_REQUEST/etc. for that HTTP status.
    // Without this, `error.details?.code` was always undefined on every screen that checks it (confirmed:
    // PaymentScreen.js's conflict-code branch could never actually match), silently falling through to
    // the generic failure path instead of the specific one.
    details: body.details,
  });
}
