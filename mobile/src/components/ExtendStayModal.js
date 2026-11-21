import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from './AppButton.js';
import { bookingsApi } from '../api/bookingsApi.js';
import { paymentsApi } from '../api/paymentsApi.js';
import { addDaysIso, formatMoneyMinor, formatStayDate } from '../utils/format.js';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

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

export function ExtendStayModal({ booking, visible, onClose, onExtended }) {
  const [extraNights, setExtraNights] = useState(1);
  const [checking, setChecking] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [paying, setPaying] = useState(false);
  const [activeOrder, setActiveOrder] = useState(null);
  const [showWebview, setShowWebview] = useState(false);

  const currentCheckOut = booking?.stay?.checkOut || booking?.checkOut;
  const newCheckOut = currentCheckOut ? addDaysIso(currentCheckOut, extraNights) : '';

  useEffect(() => {
    if (!visible || !booking?.id || !newCheckOut) return;
    let cancelled = false;
    setChecking(true);
    setError(null);
    setPreview(null);

    bookingsApi
      .checkExtension(booking.id, { newCheckOut })
      .then((res) => {
        if (!cancelled) setPreview(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Unable to check availability for selected dates.');
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, booking?.id, newCheckOut]);

  const handlePayAndExtend = async () => {
    if (!preview?.available) return;
    setPaying(true);
    setError(null);

    try {
      const order = await bookingsApi.createExtensionOrder(booking.id, { newCheckOut });
      setActiveOrder(order);

      if (order.simulated) {
        // Dev / Simulated checkout
        const simResult = await paymentsApi.devCheckout(order.orderId, 'success');
        if (simResult.status === 'SUCCESS' || simResult.paymentId) {
          const finalRes = await bookingsApi.confirmExtension(booking.id, {
            razorpay_order_id: order.orderId,
            razorpay_payment_id: simResult.paymentId || `pay_sim_${Date.now()}`,
            razorpay_signature: 'simulated_signature_valid',
          });
          Alert.alert(
            'Stay extended!',
            `Your stay has been extended till ${formatStayDate(newCheckOut)}.`,
            [{ text: 'OK', onPress: () => { onClose(); onExtended?.(finalRes.booking); } }]
          );
        }
        return;
      }

      // Real or Razorpay WebView
      setShowWebview(true);
    } catch (err) {
      setError(err.message || 'Could not initiate extension payment.');
    } finally {
      setPaying(false);
    }
  };

  const onWebviewMessage = async (event) => {
    setShowWebview(false);
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'success') {
        setPaying(true);
        const finalRes = await bookingsApi.confirmExtension(booking.id, {
          razorpay_order_id: data.razorpay_order_id,
          razorpay_payment_id: data.razorpay_payment_id,
          razorpay_signature: data.razorpay_signature,
        });
        Alert.alert(
          'Stay extended!',
          `Your stay has been extended till ${formatStayDate(newCheckOut)}.`,
          [{ text: 'OK', onPress: () => { onClose(); onExtended?.(finalRes.booking); } }]
        );
      } else if (data.type === 'failed') {
        Alert.alert('Payment failed', data.reason ?? 'Extension payment was not completed.');
      }
    } catch (err) {
      Alert.alert('Extension error', err.message || 'Could not confirm extension.');
    } finally {
      setPaying(false);
    }
  };

  if (!booking) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.flex1}>
              <Text style={styles.sheetTitle}>Extend your stay</Text>
              <Text style={styles.sheetSubtitle} numberOfLines={1}>{booking.hotel?.name}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={colors.textStrong} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {/* Current Check-out info */}
            <View style={styles.currentDatesBox}>
              <Ionicons name="calendar-outline" size={16} color={colors.brand600} />
              <Text style={styles.currentDatesText}>
                Current check-out: <Text style={styles.bold}>{formatStayDate(currentCheckOut)}</Text>
              </Text>
            </View>

            {/* Stepper for extra nights */}
            <View style={styles.stepperSection}>
              <Text style={styles.sectionLabel}>Add extra nights</Text>
              <View style={styles.stepperRow}>
                <Pressable
                  style={[styles.stepBtn, extraNights <= 1 && styles.stepBtnDisabled]}
                  onPress={() => setExtraNights((n) => Math.max(1, n - 1))}
                  disabled={extraNights <= 1 || checking || paying}
                >
                  <Ionicons name="remove" size={18} color={extraNights <= 1 ? colors.textMuted : colors.textStrong} />
                </Pressable>
                <View style={styles.nightsBadge}>
                  <Text style={styles.nightsText}>
                    +{extraNights} {extraNights === 1 ? 'night' : 'nights'}
                  </Text>
                </View>
                <Pressable
                  style={[styles.stepBtn, extraNights >= 30 && styles.stepBtnDisabled]}
                  onPress={() => setExtraNights((n) => Math.min(30, n + 1))}
                  disabled={extraNights >= 30 || checking || paying}
                >
                  <Ionicons name="add" size={18} color={extraNights >= 30 ? colors.textMuted : colors.textStrong} />
                </Pressable>
              </View>
            </View>

            {/* New check-out banner */}
            <View style={styles.newCheckOutBanner}>
              <Ionicons name="arrow-forward-circle" size={18} color={colors.success600} />
              <View style={styles.flex1}>
                <Text style={styles.newCheckOutLabel}>New check-out date:</Text>
                <Text style={styles.newCheckOutValue}>{formatStayDate(newCheckOut)}</Text>
              </View>
            </View>

            {/* Quote details */}
            {checking && (
              <View style={styles.checkingWrap}>
                <ActivityIndicator size="small" color={colors.brand600} />
                <Text style={styles.checkingText}>Checking room availability and rates…</Text>
              </View>
            )}

            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger600} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {preview && !checking && (
              <>
                {!preview.available ? (
                  <View style={styles.errorBox}>
                    <Ionicons name="close-circle-outline" size={16} color={colors.danger600} />
                    <Text style={styles.errorText}>
                      {preview.message || 'Room is not available for the requested extension dates.'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.priceCard}>
                    <Text style={styles.priceHeading}>Extension price breakdown</Text>
                    <View style={styles.priceRow}>
                      <Text style={styles.priceLabel}>Additional nights subtotal</Text>
                      <Text style={styles.priceValue}>{formatMoneyMinor(preview.subtotalMinor, preview.currency)}</Text>
                    </View>
                    {preview.discountMinor > 0 && (
                      <View style={styles.priceRow}>
                        <Text style={styles.priceLabel}>Discount</Text>
                        <Text style={[styles.priceValue, styles.successValue]}>
                          −{formatMoneyMinor(preview.discountMinor, preview.currency)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.priceRow}>
                      <Text style={styles.priceLabel}>Taxes</Text>
                      <Text style={styles.priceValue}>{formatMoneyMinor(preview.taxesMinor, preview.currency)}</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.priceRow}>
                      <Text style={styles.totalLabel}>Total to pay</Text>
                      <Text style={styles.totalValue}>{formatMoneyMinor(preview.totalMinor, preview.currency)}</Text>
                    </View>
                  </View>
                )}
              </>
            )}

            <AppButton
              title={
                checking
                  ? 'Checking availability…'
                  : preview?.available
                  ? `Pay ${formatMoneyMinor(preview.totalMinor, preview.currency)} & Extend`
                  : 'Extend stay'
              }
              onPress={handlePayAndExtend}
              disabled={checking || paying || !preview?.available}
              loading={paying}
              style={styles.payBtn}
            />
          </ScrollView>
        </View>
      </View>

      {/* Razorpay WebView modal if activeOrder requires live popup */}
      {showWebview && activeOrder && (
        <Modal visible={showWebview} animationType="slide" onRequestClose={() => setShowWebview(false)}>
          <View style={styles.webviewContainer}>
            <View style={styles.webviewHeader}>
              <Pressable onPress={() => setShowWebview(false)}>
                <Text style={styles.webviewClose}>Cancel</Text>
              </Pressable>
            </View>
            <WebView
              source={{ html: checkoutHtml(activeOrder) }}
              onMessage={onWebviewMessage}
              originWhitelist={['*']}
            />
          </View>
        </Modal>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surfaceCard,
    borderTopLeftRadius: radius.modal,
    borderTopRightRadius: radius.modal,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  flex1: { flex: 1 },
  sheetTitle: {
    ...typography.title,
    color: colors.textStrong,
  },
  sheetSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  body: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  currentDatesBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.brand50,
    borderRadius: radius.control,
    padding: spacing.md,
  },
  currentDatesText: {
    ...typography.caption,
    color: colors.brand700,
  },
  bold: {
    fontWeight: '700',
  },
  stepperSection: {
    gap: spacing.xs,
  },
  sectionLabel: {
    ...typography.captionStrong,
    color: colors.textStrong,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfacePage,
  },
  stepBtnDisabled: {
    opacity: 0.4,
  },
  nightsBadge: {
    flex: 1,
    height: 44,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.brand200,
    backgroundColor: colors.brand50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nightsText: {
    ...typography.bodyStrong,
    color: colors.brand700,
  },
  newCheckOutBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success50,
    borderRadius: radius.control,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  newCheckOutLabel: {
    ...typography.tiny,
    color: colors.success700,
  },
  newCheckOutValue: {
    ...typography.bodyStrong,
    color: colors.success700,
  },
  checkingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  checkingText: {
    ...typography.caption,
    color: colors.brand600,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.danger50,
    borderRadius: radius.control,
    padding: spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger600,
    flex: 1,
  },
  priceCard: {
    backgroundColor: colors.surfacePage,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  priceHeading: {
    ...typography.captionStrong,
    color: colors.textStrong,
    marginBottom: spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  priceValue: {
    ...typography.captionStrong,
    color: colors.textStrong,
  },
  successValue: {
    color: colors.success600,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: spacing.xs,
  },
  totalLabel: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  totalValue: {
    ...typography.title,
    color: colors.brand600,
  },
  payBtn: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  webviewContainer: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  webviewHeader: {
    padding: spacing.md,
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  webviewClose: {
    ...typography.bodyStrong,
    color: colors.brand600,
  },
});
