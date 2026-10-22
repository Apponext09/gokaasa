import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native';
import PaymentScreen from '../../src/screens/PaymentScreen.js';

jest.mock('../../src/api/paymentsApi.js', () => ({
  paymentsApi: { createOrder: jest.fn(), verify: jest.fn(), failed: jest.fn(), devCheckout: jest.fn() },
}));

// A lightweight stand-in for the native WebView host (jest-expo has none): it renders as a plain host
// component carrying the same props, so `fireEvent(el, 'message', ...)` can invoke the real `onMessage`
// prop PaymentScreen passed it, exactly the way a genuine WebView postMessage would.
jest.mock('react-native-webview', () => {
  const React = require('react');
  return { WebView: (props) => React.createElement('WebViewStub', props) };
});

import { paymentsApi } from '../../src/api/paymentsApi.js';

// A real order shape, matching backend/src/services/payment.service.js#orderResponse exactly.
const REAL_ORDER = {
  orderId: 'order_abc123',
  amount: 500000,
  currency: 'INR',
  keyId: 'rzp_test_key',
  simulated: false,
  mode: 'live',
  bookingId: 1,
  bookingRef: 'GK-1001',
  holdId: 99,
  expiresAt: '2026-11-12T10:00:00.000Z',
  description: 'Abbot Hotel · GK-1001',
  prefill: { name: 'Jane Doe', email: 'jane@example.com', contact: '9876543210' },
};

const SIMULATED_ORDER = { ...REAL_ORDER, simulated: true, keyId: null, mode: 'simulated' };

// render() itself returns a Promise in this project's testing-library version (its result must be
// awaited before any `screen` query, or queries fail with "`render` function has not been called").
async function renderScreen(overrides = {}) {
  const route = { params: { holdId: 99, hotelName: 'Abbot Hotel', ...overrides } };
  const navigation = { navigate: jest.fn(), replace: jest.fn(), popToTop: jest.fn() };
  await render(<PaymentScreen route={route} navigation={navigation} />);
  return { navigation };
}

async function openCheckout() {
  await waitFor(() => expect(screen.queryByText('Pay now')).toBeTruthy());
  fireEvent.press(screen.getByText('Pay now'));
  await waitFor(() => expect(screen.queryByTestId('razorpay-webview')).toBeTruthy());
}

async function postWebViewMessage(data) {
  await act(async () => {
    fireEvent(screen.getByTestId('razorpay-webview'), 'message', { nativeEvent: { data: JSON.stringify(data) } });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PaymentScreen', () => {
  test('order creation success: shows the server-computed total and booking reference, never a client-made-up amount', async () => {
    paymentsApi.createOrder.mockResolvedValue(REAL_ORDER);
    await renderScreen();

    await waitFor(() => expect(screen.queryByText('Order GK-1001')).toBeTruthy());
    expect(paymentsApi.createOrder).toHaveBeenCalledWith(99);
    expect(screen.getByText('₹5,000')).toBeTruthy();
  });

  test('order creation failure: shows an error state instead of crashing, with a retry that re-requests a fresh order', async () => {
    paymentsApi.createOrder.mockRejectedValue({ status: 500, code: 'ERROR', message: 'Could not create order', fieldErrors: {} });
    const { navigation } = await renderScreen();

    await waitFor(() => expect(screen.queryByText('Could not create order')).toBeTruthy());

    fireEvent.press(screen.getByText('Try again'));
    expect(navigation.replace).toHaveBeenCalledWith('Payment', { holdId: 99, hotelName: 'Abbot Hotel' });
  });

  test('real checkout success: forwards the WebView\'s razorpay fields to /payments/verify and only then navigates to the confirmation screen', async () => {
    paymentsApi.createOrder.mockResolvedValue(REAL_ORDER);
    paymentsApi.verify.mockResolvedValue({ status: 'CONFIRMED', booking: { id: 1, status: 'CONFIRMED' } });
    const { navigation } = await renderScreen();
    await openCheckout();

    expect(navigation.replace).not.toHaveBeenCalled();
    await postWebViewMessage({ type: 'success', razorpay_order_id: 'order_abc123', razorpay_payment_id: 'pay_1', razorpay_signature: 'sig_1' });

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('BookingConfirmation', { booking: { id: 1, status: 'CONFIRMED' }, bookingId: 1 }));
    expect(paymentsApi.verify).toHaveBeenCalledWith({ razorpay_order_id: 'order_abc123', razorpay_payment_id: 'pay_1', razorpay_signature: 'sig_1' });
  });

  test('the WebView\'s own "success" message is never trusted as proof of payment on its own -- a server-side verification rejection still blocks confirmation', async () => {
    paymentsApi.createOrder.mockResolvedValue(REAL_ORDER);
    paymentsApi.verify.mockRejectedValue({ status: 400, code: 'BAD_REQUEST', message: 'Payment signature could not be verified', fieldErrors: {} });
    const { navigation } = await renderScreen();
    await openCheckout();

    await postWebViewMessage({ type: 'success', razorpay_order_id: 'order_abc123', razorpay_payment_id: 'pay_1', razorpay_signature: 'tampered' });

    await waitFor(() => expect(screen.queryByText('Payment signature could not be verified')).toBeTruthy());
    expect(navigation.replace).not.toHaveBeenCalledWith('BookingConfirmation', expect.anything());
  });

  test('checkout failure from the gateway reports it to the backend and shows a retryable error, without confirming anything', async () => {
    paymentsApi.createOrder.mockResolvedValue(REAL_ORDER);
    const { navigation } = await renderScreen();
    await openCheckout();

    await postWebViewMessage({ type: 'failed', reason: 'Card declined' });

    await waitFor(() => expect(screen.queryByText('Card declined')).toBeTruthy());
    expect(paymentsApi.failed).toHaveBeenCalledWith('order_abc123', 'Card declined');
    expect(navigation.replace).not.toHaveBeenCalledWith('BookingConfirmation', expect.anything());
  });

  test('checkout cancellation (modal dismissed) returns to the payment screen without marking anything failed or confirmed', async () => {
    paymentsApi.createOrder.mockResolvedValue(REAL_ORDER);
    await renderScreen();
    await openCheckout();

    await postWebViewMessage({ type: 'dismiss' });

    await waitFor(() => expect(screen.queryByText('Pay now')).toBeTruthy());
    expect(paymentsApi.verify).not.toHaveBeenCalled();
    expect(paymentsApi.failed).not.toHaveBeenCalled();
  });

  test('an unparseable or unexpected WebView message is ignored safely rather than acted on', async () => {
    paymentsApi.createOrder.mockResolvedValue(REAL_ORDER);
    await renderScreen();
    await openCheckout();

    await act(async () => {
      fireEvent(screen.getByTestId('razorpay-webview'), 'message', { nativeEvent: { data: 'not json at all' } });
    });

    await waitFor(() => expect(screen.queryByText('Pay now')).toBeTruthy());
    expect(paymentsApi.verify).not.toHaveBeenCalled();
    expect(paymentsApi.failed).not.toHaveBeenCalled();
  });

  test('conflict codes (e.g. a booking that is already paid, or whose hold expired) offer "start over" instead of a blind retry of the same order', async () => {
    paymentsApi.createOrder.mockResolvedValue(REAL_ORDER);
    paymentsApi.verify.mockRejectedValue({ status: 409, code: 'CONFLICT', message: 'This booking has already been paid', fieldErrors: {}, details: { code: 'ALREADY_PAID' } });
    const { navigation } = await renderScreen();
    await openCheckout();

    await postWebViewMessage({ type: 'success', razorpay_order_id: 'order_abc123', razorpay_payment_id: 'pay_1', razorpay_signature: 'sig_1' });

    await waitFor(() => expect(screen.queryByText('This booking can’t take payment right now')).toBeTruthy());
    fireEvent.press(screen.getByText('Try again'));
    expect(navigation.popToTop).toHaveBeenCalled();
  });

  test('duplicate submissions are prevented: the Pay now button is gone while verification is in flight, so a second tap cannot fire a second checkout', async () => {
    paymentsApi.createOrder.mockResolvedValue(REAL_ORDER);
    let resolveVerify;
    paymentsApi.verify.mockReturnValue(new Promise((resolve) => { resolveVerify = resolve; }));
    const { navigation } = await renderScreen();
    await openCheckout();

    // verify() deliberately stays pending until resolved below -- this proves the screen leaves its
    // "verifying" state up while in flight, so a second tap physically cannot fire a second checkout.
    await act(async () => {
      fireEvent(screen.getByTestId('razorpay-webview'), 'message', { nativeEvent: { data: JSON.stringify({ type: 'success', razorpay_order_id: 'order_abc123', razorpay_payment_id: 'pay_1', razorpay_signature: 'sig_1' }) } });
    });

    expect(screen.queryByText('Pay now')).toBeNull();
    expect(screen.queryByText('Confirming your payment…')).toBeTruthy();

    await act(async () => {
      resolveVerify({ status: 'CONFIRMED', booking: { id: 1, status: 'CONFIRMED' } });
    });
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('BookingConfirmation', { booking: { id: 1, status: 'CONFIRMED' }, bookingId: 1 }));
    expect(paymentsApi.verify).toHaveBeenCalledTimes(1);
  });

  test('simulated gateway (no real Razorpay keys configured): a simulated success still goes through the real server-side signature check, not a client-side shortcut', async () => {
    paymentsApi.createOrder.mockResolvedValue(SIMULATED_ORDER);
    paymentsApi.devCheckout.mockResolvedValue({ razorpay_order_id: 'order_abc123', razorpay_payment_id: 'pay_sim', razorpay_signature: 'sig_sim' });
    paymentsApi.verify.mockResolvedValue({ status: 'CONFIRMED', booking: { id: 1, status: 'CONFIRMED' } });
    const { navigation } = await renderScreen();

    await waitFor(() => expect(screen.queryByText('Simulate a successful payment')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Simulate a successful payment'));
    });

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('BookingConfirmation', { booking: { id: 1, status: 'CONFIRMED' }, bookingId: 1 }));
    expect(paymentsApi.devCheckout).toHaveBeenCalledWith('order_abc123', 'success');
    expect(paymentsApi.verify).toHaveBeenCalledWith({ razorpay_order_id: 'order_abc123', razorpay_payment_id: 'pay_sim', razorpay_signature: 'sig_sim' });
  });

  test('simulated gateway failure reports it the same way a real gateway failure would, never a fake success', async () => {
    paymentsApi.createOrder.mockResolvedValue(SIMULATED_ORDER);
    paymentsApi.devCheckout.mockResolvedValue({ razorpay_order_id: 'order_abc123' });
    const { navigation } = await renderScreen();

    await waitFor(() => expect(screen.queryByText('Simulate a failed payment')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Simulate a failed payment'));
    });

    await waitFor(() => expect(screen.queryByText('Simulated payment failure')).toBeTruthy());
    expect(paymentsApi.failed).toHaveBeenCalledWith('order_abc123', 'Simulated payment failure');
    expect(navigation.replace).not.toHaveBeenCalledWith('BookingConfirmation', expect.anything());
  });
});
