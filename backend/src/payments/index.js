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
