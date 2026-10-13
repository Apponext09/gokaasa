import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { LoadingView } from '../components/LoadingView.js';
import { ErrorView } from '../components/ErrorView.js';
import { AppButton } from '../components/AppButton.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { paymentsApi } from '../api/paymentsApi.js';
import { formatMoneyMinor } from '../utils/format.js';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

/**
 * Only the public Razorpay key id and the server's own order/amount ever reach this screen -- the secret
 * key never leaves the backend. A payment is only ever considered successful after /payments/verify
 * (the server's own signature check) returns 200; nothing the WebView or the dev-checkout buttons report
 * is trusted on its own. See mobile/README.md "Razorpay integration" for why a WebView is used instead of
 * the react-native-razorpay native SDK (that SDK needs a custom Expo dev build, not Expo Go).
 */
function checkoutHtml({ keyId, orderId, amount, currency, description, prefill }) {
  const options = JSON.stringify({
    key: keyId,
    order_id: orderId,
    amount,
    currency,
    name: 'Gokaasa',
    description,
    prefill,
    theme: { color: '#1e3a5f' },
  });
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"/></head>
  <body style="margin:0;background:#faf8f4;">
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    function post(data) { window.ReactNativeWebView.postMessage(JSON.stringify(data)); }
    try {
      var options = ${options};
      options.handler = function (response) {
        post({ type: 'success', razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature });
      };
      options.modal = { ondismiss: function () { post({ type: 'dismiss' }); } };
      var rzp = new Razorpay(options);
      rzp.on('payment.failed', function (response) { post({ type: 'failed', reason: response?.error?.description ?? 'Payment failed' }); });
      rzp.open();
    } catch (e) {
      post({ type: 'failed', reason: 'Could not open the payment window' });
    }
  </script>
  </body></html>`;
}

export default function PaymentScreen({ route, navigation }) {
  const { holdId, hotelName } = route.params;
  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | verifying | error
  const [error, setError] = useState(null);
  const [showWebview, setShowWebview] = useState(false);

  useEffect(() => {
    paymentsApi
      .createOrder(holdId)
      .then((data) => {
        setOrder(data);
        setStatus('ready');
      })
      .catch((err) => {
        setError(err);
        setStatus('error');
      });
  }, [holdId]);

  const verifyAndFinish = async (payload) => {
    setStatus('verifying');
    try {
      const result = await paymentsApi.verify(payload);
      navigation.replace('BookingConfirmation', { booking: result.booking, bookingId: result.booking?.id ?? order.bookingId });
    } catch (err) {
      setError(err);
      setStatus('error');
    }
  };

  const reportFailure = async (reason) => {
    try {
      await paymentsApi.failed(order.orderId, reason);
    } catch {
      // Best-effort only; the booking simply stays PAYMENT_PENDING and the user can retry.
    }
    setError({ message: reason || 'The payment was not completed. You can try again.' });
    setStatus('error');
  };

  const startSimulated = async (outcome) => {
    setStatus('verifying');
    try {
      const result = await paymentsApi.devCheckout(order.orderId, outcome);
      if (outcome === 'failure') {
        await reportFailure('Simulated payment failure');
        return;
      }
      await verifyAndFinish({
        razorpay_order_id: result.razorpay_order_id,
        razorpay_payment_id: result.razorpay_payment_id,
        razorpay_signature: result.razorpay_signature,
      });
    } catch (err) {
      setError(err);
      setStatus('error');
    }
  };

  const onWebviewMessage = async (event) => {
    setShowWebview(false);
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'success') {
        await verifyAndFinish({
          razorpay_order_id: data.razorpay_order_id,
          razorpay_payment_id: data.razorpay_payment_id,
          razorpay_signature: data.razorpay_signature,
        });
      } else if (data.type === 'failed') {
        await reportFailure(data.reason);
      } else {
        setStatus('ready');
      }
    } catch {
      setStatus('ready');
    }
  };

  if (status === 'loading') return <LoadingView label="Preparing payment…" />;
  if (status === 'verifying') return <LoadingView label="Confirming your payment…" />;
  if (status === 'error') {
    // These specific codes travel in `details.code`, not the generic top-level `code` (CONFLICT for all
    // four) -- see client.js's normalizeError and errorHandler.js's `details: error.details`. Matches the
    // website's identical check (BookingReviewPage.jsx: `normalized.details?.code`).
    const isConflict = ['ALREADY_PAID', 'HOLD_EXPIRED', 'PRICE_CHANGED', 'NOT_PAYABLE'].includes(error?.details?.code);
    return (
      <ErrorView
        title={isConflict ? 'This booking can’t take payment right now' : 'Payment did not go through'}
        message={error?.message}
        onRetry={isConflict ? () => navigation.popToTop() : () => navigation.replace('Payment', route.params)}
      />
    );
  }

  return (
    <ScreenContainer edges={['bottom']}>
      <FadeSlideIn style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.hotelName}>{hotelName}</Text>
          <Text style={styles.caption}>Order {order.bookingRef}</Text>
          <Text style={styles.amount}>{formatMoneyMinor(order.amount, order.currency)}</Text>
          <View style={styles.secureRow}>
            <Ionicons name="lock-closed-outline" size={13} color={colors.success600} />
            <Text style={styles.secureText}>Secured by Razorpay · verified on our server, never on this device</Text>
          </View>
        </View>

        {order.simulated ? (
          <View style={styles.card}>
            <View style={styles.row}>
              <Ionicons name="information-circle-outline" size={16} color={colors.warning600} />
              <Text style={styles.warning}>
                No real payment gateway is configured on the server, so this stands in for Razorpay Checkout. The
                booking is confirmed only through the same server-side signature check used for real payments.
              </Text>
            </View>
            <AppButton title="Simulate a successful payment" onPress={() => startSimulated('success')} style={{ marginTop: spacing.md }} />
            <AppButton title="Simulate a failed payment" variant="secondary" onPress={() => startSimulated('failure')} style={{ marginTop: spacing.sm }} />
          </View>
        ) : (
          <AppButton title="Pay now" onPress={() => setShowWebview(true)} style={{ marginTop: spacing.lg }} />
        )}
      </FadeSlideIn>

      <Modal visible={showWebview} animationType="slide" onRequestClose={() => setShowWebview(false)}>
        <ScreenContainer>
          <View style={styles.webviewHeader}>
            <Pressable onPress={() => setShowWebview(false)}>
              <Text style={styles.webviewClose}>Cancel</Text>
            </Pressable>
          </View>
          <WebView source={{ html: checkoutHtml(order) }} onMessage={onWebviewMessage} originWhitelist={['*']} />
        </ScreenContainer>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  card: { backgroundColor: colors.surfaceCard, borderRadius: radius.card, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderSubtle, gap: 4, ...shadow.card },
  hotelName: { ...typography.h1, color: colors.textStrong },
  caption: { ...typography.caption, color: colors.textMuted },
  amount: { ...typography.display, color: colors.textStrong, marginTop: spacing.sm },
  secureRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  secureText: { ...typography.tiny, color: colors.success600, flexShrink: 1 },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  warning: { ...typography.caption, color: colors.warning600, flex: 1 },
  webviewHeader: { padding: spacing.md, alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  webviewClose: { ...typography.bodyStrong, color: colors.brand600 },
});
