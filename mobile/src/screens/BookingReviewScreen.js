import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { LoadingView } from '../components/LoadingView.js';
import { ErrorView } from '../components/ErrorView.js';
import { AppButton } from '../components/AppButton.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { HoldCountdown } from '../components/HoldCountdown.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { bookingsApi } from '../api/bookingsApi.js';
import { paymentsApi } from '../api/paymentsApi.js';
import { formatMoneyMinor, formatStayDate, summarizeOccupancy } from '../utils/format.js';
import { MEAL_PLAN_LABEL } from '../constants/booking.js';
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

export default function BookingReviewScreen({ route, navigation }) {
  const { holdId, hotelName: fallbackHotelName, roomName: fallbackRoomName, planName: fallbackPlanName } = route.params || {};

  const [activeHoldId, setActiveHoldId] = useState(holdId);
  const [holdState, setHoldState] = useState({ status: 'loading', hold: null, error: null });
  const [couponCode, setCouponCode] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState(null);
  const [availableOffers, setAvailableOffers] = useState([]);

  // Payment state
  const [order, setOrder] = useState(null);
  const [paymentPhase, setPaymentPhase] = useState('idle'); // idle | creating | ready | verifying | error
  const [paymentError, setPaymentError] = useState(null);
  const [showWebview, setShowWebview] = useState(false);
  const [showSimulatedModal, setShowSimulatedModal] = useState(false);
  const [expired, setExpired] = useState(false);

  const loadAvailableCoupons = useCallback((hId) => {
    if (!hId) return;
    bookingsApi
      .holdCoupons(hId)
      .then((items) => setAvailableOffers(Array.isArray(items) ? items : []))
      .catch(() => setAvailableOffers([]));
  }, []);

  const loadHold = useCallback(async (targetId = activeHoldId) => {
    if (!targetId) {
      setHoldState({ status: 'error', hold: null, error: 'Missing booking hold reference.' });
      return;
    }
    try {
      const data = await bookingsApi.hold(targetId);
      setHoldState({ status: 'ready', hold: data, error: null });
      if (!data.quote?.coupon) {
        loadAvailableCoupons(targetId);
      } else {
        setAvailableOffers([]);
      }
    } catch (err) {
      setHoldState({ status: 'error', hold: null, error: err.message || 'Unable to load booking details.' });
    }
  }, [activeHoldId, loadAvailableCoupons]);

  useEffect(() => {
    loadHold();
  }, [loadHold]);

  const applyCoupon = async (codeToApply) => {
    const code = (typeof codeToApply === 'string' ? codeToApply : couponCode).trim().toUpperCase();
    if (!code) return;
    setCouponBusy(true);
    setCouponError(null);
    try {
      const updatedHold = await bookingsApi.applyCoupon(activeHoldId, code);
      setHoldState((s) => ({ ...s, hold: updatedHold }));
      setCouponCode('');
      setAvailableOffers([]);
    } catch (err) {
      setCouponError(err.message || 'Invalid or inapplicable coupon code.');
    } finally {
      setCouponBusy(false);
    }
  };

  const removeCoupon = async () => {
    setCouponBusy(true);
    setCouponError(null);
    try {
      const updatedHold = await bookingsApi.removeCoupon(activeHoldId);
      setHoldState((s) => ({ ...s, hold: updatedHold }));
      loadAvailableCoupons(activeHoldId);
    } catch (err) {
      Alert.alert('Unable to remove coupon', err.message || 'Please try again.');
    } finally {
      setCouponBusy(false);
    }
  };

  const handleHoldExpire = () => {
    setExpired(true);
    if (!activeHoldId) return;
    bookingsApi
      .hold(activeHoldId)
      .then((updatedHold) => {
        setHoldState((s) => ({ ...s, hold: updatedHold }));
      })
      .catch(() => {});
  };

  const handlePayPress = async () => {
    if (expired) {
      Alert.alert('Hold expired', 'Your room hold has expired. Please choose your stay dates and room again.');
      return;
    }
    setPaymentPhase('creating');
    setPaymentError(null);
    try {
      const orderData = await paymentsApi.createOrder(activeHoldId);
      setOrder(orderData);
      setPaymentPhase('ready');

      if (orderData.simulated) {
        setShowSimulatedModal(true);
      } else {
        setShowWebview(true);
      }
    } catch (err) {
      setPaymentPhase('error');
      setPaymentError(err.message || 'Could not initiate payment. Please try again.');
      Alert.alert('Payment initiation failed', err.message || 'Could not start payment. Please try again.');
    }
  };

  const verifyAndFinish = async (payload) => {
    setPaymentPhase('verifying');
    setShowWebview(false);
    setShowSimulatedModal(false);
    try {
      const result = await paymentsApi.verify(payload);
      navigation.replace('BookingConfirmation', {
        booking: result.booking,
        bookingId: result.booking?.id ?? order?.bookingId,
      });
    } catch (err) {
      setPaymentPhase('error');
      setPaymentError(err.message || 'Payment verification failed.');
      Alert.alert('Verification failed', err.message || 'Could not verify payment signature.');
    }
  };

  const reportFailure = async (reason) => {
    setShowWebview(false);
    setShowSimulatedModal(false);
    if (order?.orderId) {
      try {
        await paymentsApi.failed(order.orderId, reason);
      } catch {
        // Best effort
      }
    }
    setPaymentPhase('error');
    setPaymentError(reason || 'The payment was not completed.');
    Alert.alert('Payment not completed', reason || 'Payment failed or was cancelled.');
  };

  const startSimulated = async (outcome) => {
    if (!order) return;
    setPaymentPhase('verifying');
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
      setPaymentPhase('error');
      setPaymentError(err.message || 'Simulated checkout failed.');
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
        setPaymentPhase('ready');
      }
    } catch {
      setPaymentPhase('ready');
    }
  };

  if (holdState.status === 'loading') {
    return <LoadingView label="Loading booking summary…" />;
  }

  if (holdState.status === 'error') {
    return (
      <ErrorView
        title="Could not load booking"
        message={holdState.error}
        onRetry={loadHold}
      />
    );
  }

  const { hold } = holdState;
  const quote = hold?.quote || {};
  const hotel = quote.hotel || {};
  const room = quote.room || {};
  const ratePlan = quote.ratePlan || {};
  const stay = quote.stay || {};
  const totals = quote.totals || {};
  const cancellationPolicy = quote.cancellationPolicy || {};
  const primaryContact = hold?.guestDetails?.primaryContact || {};

  const displayHotelName = hotel.name || fallbackHotelName || 'Hotel Stay';
  const displayRoomName = room.name || fallbackRoomName || 'Room';
  const displayPlanName = ratePlan.name || fallbackPlanName || (ratePlan.mealPlan ? MEAL_PLAN_LABEL[ratePlan.mealPlan] : 'Standard Plan');

  const guestName = [primaryContact.firstName, primaryContact.lastName].filter(Boolean).join(' ') || 'Guest';

  return (
    <ScreenContainer edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* ── Hold Countdown Header ── */}
        <View style={styles.countdownContainer}>
          <HoldCountdown
            secondsRemaining={hold.secondsRemaining}
            expiresAt={hold.expiresAt}
            onExpire={handleHoldExpire}
          />
        </View>

        {expired && (
          <View style={styles.expiredBanner}>
            <Ionicons name="time-outline" size={16} color={colors.danger600} />
            <Text style={styles.expiredText}>This room hold has expired. Please select your room again.</Text>
          </View>
        )}

        <FadeSlideIn style={styles.content}>
          {/* ── Hotel & Stay Details Card ── */}
          <View style={[styles.card, shadow.card]}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.hotelInfoCol}>
                <Text style={styles.hotelName}>{displayHotelName}</Text>
                {hotel.address ? <Text style={styles.hotelAddress} numberOfLines={1}>{hotel.address}</Text> : null}
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.stayDetailsRow}>
              <View style={styles.stayDateBlock}>
                <Text style={styles.metaLabel}>CHECK-IN</Text>
                <Text style={styles.dateValue}>{formatStayDate(stay.checkIn, { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              </View>
              <View style={styles.stayNightsPill}>
                <Text style={styles.stayNightsText}>{stay.nights || 1} Night{stay.nights === 1 ? '' : 's'}</Text>
                <Ionicons name="arrow-forward" size={12} color={colors.brand600} />
              </View>
              <View style={styles.stayDateBlock}>
                <Text style={styles.metaLabel}>CHECK-OUT</Text>
                <Text style={styles.dateValue}>{formatStayDate(stay.checkOut, { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              </View>
            </View>

            <View style={styles.roomSummaryRow}>
              <View style={styles.roomIconWrap}>
                <Ionicons name="bed-outline" size={16} color={colors.brand600} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.roomNameText}>{displayRoomName}</Text>
                <Text style={styles.planNameText}>{displayPlanName}</Text>
                {stay.occupancy ? (
                  <Text style={styles.occupancyText}>
                    {summarizeOccupancy(stay.occupancy, hold.petsCount || hold.guestDetails?.pets?.length || stay.petsCount)}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>

          {/* ── Primary Guest Details Card ── */}
          <View style={[styles.card, shadow.card]}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardTitleWrap}>
                <Ionicons name="person-outline" size={16} color={colors.brand600} />
                <Text style={styles.cardHeading}>Guest details</Text>
              </View>
              <Pressable
                onPress={() => {
                  if (activeHoldId !== holdId) {
                    navigation.navigate('Booking', {
                      holdId: activeHoldId,
                      hotelName: displayHotelName,
                      roomName: displayRoomName,
                      planName: displayPlanName,
                    });
                  } else {
                    navigation.goBack();
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel="Edit guest details"
                style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.editBtnText}>Edit</Text>
              </Pressable>
            </View>

            <View style={styles.guestInfoRow}>
              {/* Primary Contact */}
              <View style={styles.primaryContactBlock}>
                <Text style={styles.guestNameText}>{guestName}</Text>
                <View style={styles.contactMetaRow}>
                  {primaryContact.mobile ? (
                    <View style={styles.metaRow}>
                      <Ionicons name="call-outline" size={13} color={colors.textMuted} />
                      <Text style={styles.metaText}>{primaryContact.mobile}</Text>
                    </View>
                  ) : null}
                  {primaryContact.email ? (
                    <View style={styles.metaRow}>
                      <Ionicons name="mail-outline" size={13} color={colors.textMuted} />
                      <Text style={styles.metaText}>{primaryContact.email}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Room-by-room guests */}
              {Array.isArray(hold?.guestDetails?.rooms) && hold.guestDetails.rooms.length > 0 ? (
                <View style={styles.roomsList}>
                  {hold.guestDetails.rooms.map((rm) => (
                    <View key={rm.roomIndex} style={styles.roomGuestItem}>
                      <Text style={styles.roomGuestLabel}>Room {rm.roomIndex + 1}:</Text>
                      <Text style={styles.roomGuestNames}>
                        {Array.isArray(rm.guests)
                          ? rm.guests
                              .map(
                                (g, idx) =>
                                  `${idx + 1}) ${g.firstName || ''} ${g.lastName || ''}`.trim() +
                                  (g.age != null && g.age !== '' ? ` (${g.age})` : '')
                              )
                              .filter(Boolean)
                              .join(', ') || 'Guest'
                          : 'Guest'}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Accompanying Pets */}
              {((hold?.guestDetails?.pets?.length > 0) || (hold?.petsCount > 0) || (stay?.petsCount > 0)) ? (
                <View style={styles.petSummaryRow}>
                  <Text style={styles.petSummaryLabel}>🐾 Pets:</Text>
                  <Text style={styles.petSummaryValue}>
                    {hold?.guestDetails?.pets?.length > 0
                      ? hold.guestDetails.pets
                          .map((p, idx) => `${idx + 1}) ${p.name ? (p.breed ? `${p.name} (${p.breed})` : p.name) : `Pet ${idx + 1}`}`)
                          .join(', ')
                      : `1) Pet 1`}
                  </Text>
                </View>
              ) : null}

              {/* Company & GST Details */}
              {hold?.guestDetails?.companyName ? (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabelInline}>Company:</Text>
                  <Text style={styles.metaText}>{hold.guestDetails.companyName}</Text>
                </View>
              ) : null}
              {hold?.guestDetails?.gstNumber ? (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabelInline}>GST:</Text>
                  <Text style={styles.metaText}>{hold.guestDetails.gstNumber}</Text>
                </View>
              ) : null}

              {/* Special Request */}
              {hold?.guestDetails?.specialRequest ? (
                <View style={styles.specialRequestBox}>
                  <Text style={styles.specialRequestLabel}>Special request:</Text>
                  <Text style={styles.specialRequestValue}>{hold.guestDetails.specialRequest}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* ── Offers & Coupons Card ── */}
          <View style={[styles.card, shadow.card]}>
            <View style={styles.cardTitleWrap}>
              <Ionicons name="pricetag-outline" size={16} color={colors.accent600} />
              <Text style={styles.cardHeading}>Offers & Coupons</Text>
            </View>

            {quote.coupon ? (
              <View style={styles.appliedCouponBanner}>
                <View style={styles.appliedCouponBadge}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.success600} />
                  <View>
                    <Text style={styles.appliedCouponCode}>{quote.coupon.code}</Text>
                    {totals.couponDiscount > 0 ? (
                      <Text style={styles.appliedCouponSavings}>
                        Save {formatMoneyMinor(totals.couponDiscount, totals.currency)}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <Pressable
                  onPress={removeCoupon}
                  disabled={couponBusy}
                  style={styles.removeCouponButton}
                  accessibilityRole="button"
                  accessibilityLabel="Remove coupon"
                >
                  <Text style={styles.removeCouponText}>{couponBusy ? 'Removing…' : 'Remove'}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.couponInputSection}>
                <View style={styles.couponInputRow}>
                  <View style={styles.couponInputWrap}>
                    <TextInput
                      value={couponCode}
                      onChangeText={(t) => {
                        setCouponCode(t);
                        setCouponError(null);
                      }}
                      placeholder="Enter coupon code"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      style={styles.couponTextInput}
                    />
                  </View>
                  <Pressable
                    testID="apply-coupon-button"
                    onPress={() => applyCoupon(couponCode)}
                    disabled={couponBusy || !couponCode.trim()}
                    style={[
                      styles.applyCouponButton,
                      (couponBusy || !couponCode.trim()) && styles.applyCouponButtonDisabled,
                    ]}
                  >
                    {couponBusy ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={styles.applyCouponButtonText}>Apply</Text>
                    )}
                  </Pressable>
                </View>

                {couponError ? (
                  <View style={styles.couponErrorRow}>
                    <Ionicons name="alert-circle-outline" size={14} color={colors.danger600} />
                    <Text style={styles.couponErrorText}>{couponError}</Text>
                  </View>
                ) : null}

                {availableOffers.length > 0 && (
                  <View style={styles.availableOffersSection}>
                    <Text style={styles.availableOffersHeading}>Available offers for this stay</Text>
                    <View style={styles.offersList}>
                      {availableOffers.map((offer) => (
                        <View key={offer.code} style={styles.offerTile}>
                          <View style={styles.offerTileLeft}>
                            <View style={styles.offerCodeBadge}>
                              <Text style={styles.offerCodeText}>{offer.code}</Text>
                            </View>
                            {offer.title ? (
                              <Text style={styles.offerTitleText} numberOfLines={1}>{offer.title}</Text>
                            ) : null}
                            {offer.discountMinor > 0 ? (
                              <Text style={styles.offerSavings}>
                                Save {formatMoneyMinor(offer.discountMinor, totals.currency)}
                              </Text>
                            ) : null}
                          </View>
                          <Pressable
                            onPress={() => applyCoupon(offer.code)}
                            disabled={couponBusy}
                            style={styles.offerApplyBtn}
                          >
                            <Text style={styles.offerApplyBtnText}>Apply</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* ── Price Breakdown Card ── */}
          <View style={[styles.card, shadow.card]}>
            <View style={styles.cardTitleWrap}>
              <Ionicons name="receipt-outline" size={16} color={colors.brand600} />
              <Text style={styles.cardHeading}>Price breakdown</Text>
            </View>

            <View style={styles.priceRowsContainer}>
              <View style={styles.priceRow}>
                <Text style={styles.priceRowLabel}>Room charges ({stay.nights || 1} night{stay.nights === 1 ? '' : 's'})</Text>
                <Text style={styles.priceRowValue}>{formatMoneyMinor(totals.subtotal, totals.currency)}</Text>
              </View>

              {totals.discount > 0 && (
                <View style={styles.priceRow}>
                  <Text style={[styles.priceRowLabel, { color: colors.success600 }]}>Special discount</Text>
                  <Text style={[styles.priceRowValue, { color: colors.success600 }]}>- {formatMoneyMinor(totals.discount, totals.currency)}</Text>
                </View>
              )}

              {totals.couponDiscount > 0 && (
                <View style={styles.priceRow}>
                  <Text style={[styles.priceRowLabel, { color: colors.success600 }]}>Coupon discount ({quote.coupon?.code})</Text>
                  <Text style={[styles.priceRowValue, { color: colors.success600 }]}>- {formatMoneyMinor(totals.couponDiscount, totals.currency)}</Text>
                </View>
              )}

              {totals.taxes > 0 && (
                <View style={styles.priceRow}>
                  <Text style={styles.priceRowLabel}>Taxes & service fees</Text>
                  <Text style={styles.priceRowValue}>+ {formatMoneyMinor(totals.taxes, totals.currency)}</Text>
                </View>
              )}

              <View style={styles.divider} />

              <View style={styles.totalRow}>
                <View>
                  <Text style={styles.totalLabel}>Total payable</Text>
                  <Text style={styles.totalSubtext}>Includes all taxes & fees</Text>
                </View>
                <Text style={styles.totalAmount}>{formatMoneyMinor(totals.total, totals.currency)}</Text>
              </View>
            </View>
          </View>

          {/* ── Cancellation & Refund Policy Card ── */}
          <View style={[styles.card, shadow.card]}>
            <View style={styles.cardTitleWrap}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.success600} />
              <Text style={styles.cardHeading}>Cancellation policy</Text>
            </View>
            <Text style={styles.cancellationText}>
              {cancellationPolicy.description ||
                (ratePlan.isRefundable
                  ? 'Free cancellation before the standard hotel deadline.'
                  : 'This reservation is non-refundable. Cancellations or no-shows are not eligible for a refund.')}
            </Text>
          </View>

          {paymentError ? (
            <View style={styles.paymentErrorCard}>
              <Ionicons name="alert-circle" size={16} color={colors.danger600} />
              <Text style={styles.paymentErrorCardText}>{paymentError}</Text>
            </View>
          ) : null}
        </FadeSlideIn>
      </ScrollView>

      {/* ── Sticky Bottom Action Bar with Pay now Button ── */}
      <View style={[styles.bottomBar, shadow.card]}>
        <View style={styles.bottomBarPriceCol}>
          <Text style={styles.bottomBarTotalLabel}>Total Amount</Text>
          <Text style={styles.bottomBarTotalValue}>{formatMoneyMinor(totals.total, totals.currency)}</Text>
        </View>
        <AppButton
          title={paymentPhase === 'creating' || paymentPhase === 'verifying' ? 'Processing…' : 'Pay now'}
          onPress={handlePayPress}
          disabled={paymentPhase === 'creating' || paymentPhase === 'verifying' || expired}
          style={styles.payNowBtn}
        />
      </View>

      {/* ── Razorpay WebView Modal ── */}
      <Modal visible={showWebview} animationType="slide" onRequestClose={() => setShowWebview(false)}>
        <ScreenContainer>
          <View style={styles.webviewHeader}>
            <Pressable onPress={() => setShowWebview(false)}>
              <Text style={styles.webviewClose}>Cancel</Text>
            </Pressable>
          </View>
          {order && (
            <WebView
              testID="razorpay-webview"
              source={{ html: checkoutHtml(order) }}
              onMessage={onWebviewMessage}
              originWhitelist={['*']}
            />
          )}
        </ScreenContainer>
      </Modal>

      {/* ── Dev Simulated Checkout Modal (When Server Has No Razorpay Keys Configured) ── */}
      <Modal visible={showSimulatedModal} transparent animationType="fade" onRequestClose={() => setShowSimulatedModal(false)}>
        <View style={styles.simModalOverlay}>
          <View style={styles.simModalCard}>
            <View style={styles.simModalHeader}>
              <Ionicons name="flask-outline" size={20} color={colors.brand600} />
              <Text style={styles.simModalTitle}>Simulated Checkout</Text>
            </View>
            <Text style={styles.simModalDesc}>
              No real Razorpay gateway keys are configured on the dev server. Choose an outcome to test payment verification.
            </Text>
            <AppButton
              title="Simulate successful payment"
              onPress={() => startSimulated('success')}
              style={{ marginTop: spacing.md }}
            />
            <AppButton
              title="Simulate failed payment"
              variant="secondary"
              onPress={() => startSimulated('failure')}
              style={{ marginTop: spacing.sm }}
            />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 100 },
  countdownContainer: {
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  expiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.danger50,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.danger200 || '#fecaca',
  },
  expiredText: { ...typography.captionStrong, color: colors.danger600, flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.card,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardHeading: { ...typography.bodyStrong, color: colors.textStrong },
  hotelInfoCol: { flex: 1 },
  hotelName: { ...typography.h2, color: colors.textStrong },
  hotelAddress: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.borderSubtle, marginVertical: spacing.xs },
  stayDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  stayDateBlock: { gap: 2 },
  metaLabel: { ...typography.tiny, color: colors.textMuted, letterSpacing: 0.5 },
  dateValue: { ...typography.bodyStrong, color: colors.textStrong },
  stayNightsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand50,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  stayNightsText: { ...typography.tiny, color: colors.brand700, fontWeight: '700' },
  roomSummaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    borderRadius: radius.control,
    marginTop: spacing.xs,
  },
  roomIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomNameText: { ...typography.bodyStrong, color: colors.textStrong },
  planNameText: { ...typography.caption, color: colors.textMuted, marginTop: 1 },
  occupancyText: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  editBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.brand50,
  },
  editBtnText: { ...typography.captionStrong, color: colors.brand700 },
  guestInfoRow: { gap: spacing.sm, marginTop: 2 },
  primaryContactBlock: { gap: 2 },
  guestNameText: { ...typography.bodyStrong, color: colors.textStrong, fontSize: 15 },
  contactMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { ...typography.caption, color: colors.textBody },
  metaLabelInline: { ...typography.captionStrong, color: colors.textStrong },
  roomsList: {
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    gap: 4,
    marginVertical: 2,
  },
  roomGuestItem: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 6,
  },
  roomGuestLabel: { fontSize: 14, fontWeight: '600', color: colors.textStrong, lineHeight: 20 },
  roomGuestNames: { fontSize: 14, fontWeight: '400', color: colors.textBody, lineHeight: 20, flexShrink: 1 },
  specialRequestBox: {
    marginTop: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.control,
    gap: 2,
  },
  specialRequestLabel: { ...typography.tiny, color: colors.textMuted, fontWeight: '600' },
  specialRequestValue: { ...typography.caption, color: colors.textStrong },
  petSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 2,
  },
  petSummaryLabel: { fontSize: 14, fontWeight: '600', color: colors.textStrong, lineHeight: 20 },
  petSummaryValue: { fontSize: 14, fontWeight: '400', color: colors.textBody, lineHeight: 20, flexShrink: 1 },
  appliedCouponBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.success50,
    padding: spacing.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  appliedCouponBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  appliedCouponCode: { ...typography.bodyStrong, color: colors.success600, letterSpacing: 0.5 },
  appliedCouponSavings: { ...typography.caption, color: colors.success600 },
  removeCouponButton: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  removeCouponText: { ...typography.captionStrong, color: colors.danger600 },
  couponInputSection: { gap: spacing.sm },
  couponInputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  couponInputWrap: {
    flex: 1,
    height: 44,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.white,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  couponTextInput: { ...typography.body, color: colors.textStrong, letterSpacing: 0.5, padding: 0 },
  applyCouponButton: {
    height: 44,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.control,
    backgroundColor: colors.brand600,
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyCouponButtonDisabled: { backgroundColor: colors.brand200 },
  applyCouponButtonText: { ...typography.bodyStrong, color: colors.white },
  couponErrorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: -2 },
  couponErrorText: { ...typography.caption, color: colors.danger600, flexShrink: 1 },
  availableOffersSection: {
    marginTop: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  availableOffersHeading: { ...typography.captionStrong, color: colors.textStrong },
  offersList: { gap: spacing.sm },
  offerTile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
  },
  offerTileLeft: { flex: 1, gap: 2 },
  offerCodeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent100,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.control / 2,
  },
  offerCodeText: { ...typography.tiny, color: colors.accent700, fontWeight: '700', letterSpacing: 0.5 },
  offerTitleText: { ...typography.captionStrong, color: colors.textStrong },
  offerSavings: { ...typography.captionStrong, color: colors.success600 },
  offerApplyBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.control,
    backgroundColor: colors.brand50,
  },
  offerApplyBtnText: { ...typography.captionStrong, color: colors.brand700 },
  priceRowsContainer: { gap: spacing.xs },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceRowLabel: { ...typography.caption, color: colors.textBody },
  priceRowValue: { ...typography.captionStrong, color: colors.textStrong },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingTop: spacing.xs,
  },
  totalLabel: { ...typography.bodyStrong, color: colors.textStrong, fontSize: 16 },
  totalSubtext: { ...typography.tiny, color: colors.textMuted },
  totalAmount: { ...typography.h1, color: colors.brand700 },
  cancellationText: { ...typography.caption, color: colors.textMuted, lineHeight: 18 },
  paymentErrorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.danger50,
    padding: spacing.md,
    borderRadius: radius.card,
  },
  paymentErrorCardText: { ...typography.caption, color: colors.danger600, flex: 1 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  bottomBarPriceCol: { flex: 1 },
  bottomBarTotalLabel: { ...typography.tiny, color: colors.textMuted },
  bottomBarTotalValue: { ...typography.h2, color: colors.textStrong },
  payNowBtn: { minWidth: 140 },
  webviewHeader: {
    padding: spacing.md,
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  webviewClose: { ...typography.bodyStrong, color: colors.brand600 },
  simModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  simModalCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.card,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
    gap: spacing.sm,
    ...shadow.card,
  },
  simModalHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  simModalTitle: { ...typography.h2, color: colors.textStrong },
  simModalDesc: { ...typography.caption, color: colors.textMuted, lineHeight: 18 },
});
