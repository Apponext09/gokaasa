/**
 * Loads and opens Razorpay Checkout. The browser only gets the public key id and the order id from the server; the
 * amount shown is the server's, and the payment is confirmed only after the server verifies its signature.
 */

const DEFAULT_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
let loading = null;

export function loadRazorpayCheckout(scriptUrl = DEFAULT_SCRIPT_URL) {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = scriptUrl;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        loading = null;
        reject(new Error('The payment window could not be loaded. Check your connection and try again.'));
      };
      document.body.appendChild(script);
    });
  }
  return loading;
}

/**
 * @param {object} options
 * @param {function} options.onSuccess receives { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * @param {function} options.onFailure receives a short reason string
 * @param {function} options.onDismiss the guest closed the window without paying
 */
export async function openRazorpayCheckout({ scriptUrl, keyId, orderId, amount, currency, description, prefill, onSuccess, onFailure, onDismiss }) {
  await loadRazorpayCheckout(scriptUrl);
  const checkout = new window.Razorpay({
    key: keyId,
    order_id: orderId,
    amount,
    currency,
    name: 'Gokaasa',
    description,
    prefill,
    theme: { color: '#2563eb' },
    handler: (response) =>
      onSuccess({
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      }),
    modal: { ondismiss: onDismiss },
  });
  checkout.on('payment.failed', (response) => onFailure(response?.error?.description ?? 'The payment was not completed'));
  checkout.open();
}
