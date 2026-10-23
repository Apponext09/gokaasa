import { config } from '../config/index.js';
import { AppError } from '../utils/AppError.js';
import { createRazorpayGateway } from './razorpayGateway.js';
import { createSimulatedGateway } from './simulatedGateway.js';

let cached = null;

/**
 * The one payment gateway in use. Razorpay is used whenever RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set
 * (the same variables the rest of the app reads). Without them, development uses the simulator; production
 * refuses to start a payment at all, so an unconfigured live site can never fake a payment.
 */
export function getGateway() {
  if (cached) return cached;
  // Automated tests must never reach a real payment gateway, even if real RAZORPAY_* credentials
  // happen to be present in the loaded .env (e.g. a developer's own live keys for running the app
  // locally) -- the one env file is shared between `npm run dev` and `npm test`. A test that needs
  // specific gateway behaviour (including the real HMAC math) injects it explicitly via
  // setGatewayForTests(), which already short-circuits above this check.
  //
  // Reads process.env directly, NOT config.env: config/index.js is evaluated the moment it's first
  // imported, which (via ES module import hoisting) happens before tests/helpers/testDb.js's own
  // `process.env.NODE_ENV = 'test'` line ever runs -- `config.env` would stay frozen at whatever
  // NODE_ENV was in `.env` (here: 'development') for the entire process. process.env itself is a
  // live, mutable object, so reading it here (at call time, not import time) sees the real value.
  if (process.env.NODE_ENV === 'test') {
    cached = createSimulatedGateway();
    return cached;
  }
  const { keyId, keySecret } = config.payments;
  if (keyId && keySecret) {
    cached = createRazorpayGateway({ keyId, keySecret });
  } else if (!config.isProduction) {
    cached = createSimulatedGateway();
  } else {
    throw AppError.serviceUnavailable('Online payments are not configured yet.');
  }
  return cached;
}

/** Test hook: use a specific gateway (for example the Razorpay adapter with a fake HTTP client). */
export function setGatewayForTests(gateway) {
  cached = gateway;
}

/** Test hook: forget the cached gateway after the environment changes. */
export function resetGatewayForTests() {
  cached = null;
}
