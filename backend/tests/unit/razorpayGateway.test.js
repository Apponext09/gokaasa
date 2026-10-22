import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRazorpayGateway, safeEqualHex } from '../../src/payments/razorpayGateway.js';

const KEY_ID = 'rzp_test_fake1234567';
const KEY_SECRET = 'fake-secret-abc';

function gateway(fetchImpl) {
  return createRazorpayGateway({ keyId: KEY_ID, keySecret: KEY_SECRET, fetchImpl });
}

// ---- safeEqualHex -------------------------------------------------------------------------------------

test('safeEqualHex: identical hex strings are equal', () => {
  assert.equal(safeEqualHex('ab12', 'ab12'), true);
});

test('safeEqualHex: a single differing character is not equal', () => {
  assert.equal(safeEqualHex('ab12', 'ab13'), false);
});

test('safeEqualHex: a length mismatch is a plain mismatch, never thrown', () => {
  assert.equal(safeEqualHex('ab12', 'ab1'), false);
  assert.equal(safeEqualHex('', 'ab'), false);
});

test('safeEqualHex: a non-string input is a mismatch, never thrown', () => {
  assert.equal(safeEqualHex(undefined, 'ab12'), false);
  assert.equal(safeEqualHex('ab12', null), false);
});

// ---- checkout signature (order_id|payment_id, HMAC-SHA256 with the key secret) ------------------------

test('verifyPaymentSignature accepts a signature computed the same way Razorpay Checkout computes it', () => {
  const orderId = 'order_abc123';
  const paymentId = 'pay_xyz789';
  const signature = crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  assert.equal(gateway().verifyPaymentSignature({ orderId, paymentId, signature }), true);
});

test('verifyPaymentSignature rejects a signature computed with the wrong secret (a forged/stale request)', () => {
  const orderId = 'order_abc123';
  const paymentId = 'pay_xyz789';
  const signature = crypto.createHmac('sha256', 'wrong-secret').update(`${orderId}|${paymentId}`).digest('hex');
  assert.equal(gateway().verifyPaymentSignature({ orderId, paymentId, signature }), false);
});

test('verifyPaymentSignature rejects a correct signature replayed against a different order/payment id pair', () => {
  const signature = crypto.createHmac('sha256', KEY_SECRET).update('order_real|pay_real').digest('hex');
  assert.equal(gateway().verifyPaymentSignature({ orderId: 'order_real', paymentId: 'pay_DIFFERENT', signature }), false);
});

test('verifyPaymentSignature rejects an empty/garbage signature', () => {
  assert.equal(gateway().verifyPaymentSignature({ orderId: 'o', paymentId: 'p', signature: '' }), false);
  assert.equal(gateway().verifyPaymentSignature({ orderId: 'o', paymentId: 'p', signature: 'not-hex-at-all' }), false);
});

// ---- mode / public surface -------------------------------------------------------------------------------

test('mode is LIVE only for an rzp_live_ key id, TEST otherwise -- the public key id is exposed, the secret never is', () => {
  const live = createRazorpayGateway({ keyId: 'rzp_live_real', keySecret: 's' });
  const testMode = createRazorpayGateway({ keyId: 'rzp_test_real', keySecret: 's' });
  assert.equal(live.mode, 'LIVE');
  assert.equal(testMode.mode, 'TEST');
  assert.equal(live.publicKeyId, 'rzp_live_real');
  assert.equal(live.simulated, false);
  assert.ok(!('keySecret' in live) && !('secret' in live), 'the gateway object itself never carries the secret as an enumerable field');
});

// ---- createOrder: request shape sent to Razorpay -------------------------------------------------------

test('createOrder sends the amount as an integer in the currency\'s smallest unit, with payment_capture on, and returns only id/amount/currency', async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, body: JSON.parse(init.body), authHeader: init.headers.Authorization };
    return { ok: true, json: async () => ({ id: 'order_123', amount: 582400, currency: 'INR', entity: 'order', extra_field_from_razorpay: 'ignored' }) };
  };
  const order = await gateway(fetchImpl).createOrder({ amountMinor: 582400, currency: 'INR', receipt: 'GK-REF-1', notes: { bookingRef: 'GK-REF-1' } });

  assert.equal(captured.url, 'https://api.razorpay.com/v1/orders');
  assert.equal(captured.body.amount, 582400, 'amount is passed through as the exact integer minor-unit value, never a float');
  assert.equal(Number.isInteger(captured.body.amount), true);
  assert.equal(captured.body.currency, 'INR');
  assert.equal(captured.body.payment_capture, 1);
  assert.equal(captured.authHeader, `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')}`);
  assert.deepEqual(order, { id: 'order_123', amount: 582400, currency: 'INR' }, 'only the fields the rest of the app needs are returned, nothing extra from the provider');
});

test('createOrder surfaces the provider\'s own refusal reason, never the request body or credentials, when Razorpay rejects the request', async () => {
  const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 'BAD_REQUEST_ERROR', description: 'Amount is invalid' } }) });
  await assert.rejects(
    () => gateway(fetchImpl).createOrder({ amountMinor: -1, currency: 'INR', receipt: 'r', notes: {} }),
    (err) => {
      assert.equal(err.message, 'Amount is invalid');
      return true;
    },
  );
});

test('createOrder reports a safe, generic failure (never throwing the raw network error) when Razorpay cannot be reached at all', async () => {
  const fetchImpl = async () => {
    throw new Error('ECONNRESET some internal socket detail');
  };
  await assert.rejects(
    () => gateway(fetchImpl).createOrder({ amountMinor: 100, currency: 'INR', receipt: 'r', notes: {} }),
    (err) => {
      assert.match(err.message, /payment provider could not be reached/i);
      return true;
    },
  );
});

// ---- fetchPayment / refund: request shape -----------------------------------------------------------

test('fetchPayment calls the real payments endpoint for the exact payment id, URL-encoded', async () => {
  let capturedUrl;
  const fetchImpl = async (url) => {
    capturedUrl = url;
    return { ok: true, json: async () => ({ id: 'pay_1', order_id: 'order_1', status: 'captured', amount: 100, currency: 'INR' }) };
  };
  await gateway(fetchImpl).fetchPayment('pay_1/weird id');
  assert.equal(capturedUrl, `https://api.razorpay.com/v1/payments/${encodeURIComponent('pay_1/weird id')}`);
});

test('refund sends the exact amount to refund (never "refund everything" by omission) and returns id/status', async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ id: 'rfnd_1', status: 'processed', amount: 50000 }) };
  };
  const refund = await gateway(fetchImpl).refund({ paymentId: 'pay_1', amountMinor: 50000, receipt: 'refund-1' });
  assert.equal(captured.url, 'https://api.razorpay.com/v1/payments/pay_1/refund');
  assert.equal(captured.body.amount, 50000);
  assert.equal(captured.body.receipt, 'refund-1');
  assert.deepEqual(refund, { id: 'rfnd_1', status: 'processed' });
});
