import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { LoadingView } from '../components/LoadingView.js';
import { ErrorView } from '../components/ErrorView.js';
import { AppInput } from '../components/AppInput.js';
import { AppButton } from '../components/AppButton.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { bookingsApi } from '../api/bookingsApi.js';
import { formatMoneyMinor, formatCountdown } from '../utils/format.js';
import { MEAL_PLAN_LABEL } from '../constants/booking.js';
import { useAuth } from '../context/AuthContext.js';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

/**
 * Guest details + booking review in one screen. The price shown is exactly hold.quote.totals from the
 * server -- never recomputed here. Saving guest details is the one write this screen performs; payment
 * itself happens on the next screen via the existing /payments endpoints.
 */
export default function BookingScreen({ route, navigation }) {
  const { holdId, hotelName, roomName, planName } = route.params;
  const { user } = useAuth();
  const [state, setState] = useState({ status: 'loading', hold: null, error: null });
  const [seconds, setSeconds] = useState(0);
  const [contact, setContact] = useState({ firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', email: user?.email ?? '', mobile: user?.phone ?? '' });
  const [specialRequest, setSpecialRequest] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    bookingsApi
      .hold(holdId)
      .then((hold) => {
        setState({ status: 'ready', hold, error: null });
        setSeconds(hold.secondsRemaining);
      })
      .catch((err) => setState({ status: 'error', hold: null, error: err.message }));
  }, [holdId]);

  useEffect(() => {
    if (state.status !== 'ready' || state.hold.status !== 'HELD') return undefined;
    timerRef.current = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timerRef.current);
  }, [state.status, state.hold]);

  if (state.status === 'loading') return <LoadingView label="Loading your hold…" />;
  if (state.status === 'error') return <ErrorView message={state.error} onRetry={() => navigation.replace('Booking', route.params)} />;

  const { hold } = state;
  if (hold.status !== 'HELD') {
    return (
      <ErrorView
        title="This hold has expired"
        message="Your room hold expired. Please search again and pick a room."
        onRetry={() => navigation.popToTop()}
      />
    );
  }

  const { totals, stay, cancellationPolicy } = hold.quote;
  const canSubmit = contact.firstName.trim() && contact.lastName.trim() && contact.email.trim() && contact.mobile.trim();

  const onContinue = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await bookingsApi.saveGuests(holdId, {
        primaryContact: {
          firstName: contact.firstName.trim(),
          lastName: contact.lastName.trim(),
          email: contact.email.trim(),
          mobile: contact.mobile.trim(),
        },
        rooms: stay.occupancy.map((_, roomIndex) => ({ roomIndex, guests: [] })),
        specialRequest: specialRequest.trim() || undefined,
      });
      navigation.navigate('Payment', { holdId, hotelName, roomName, planName });
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <FadeSlideIn style={[styles.timerBanner, seconds < 120 && styles.timerBannerUrgent]}>
            <Ionicons name="time-outline" size={16} color={seconds < 120 ? colors.danger600 : colors.warning600} />
            <Text style={[styles.timerText, seconds < 120 && styles.timerTextUrgent]}>Room held for {formatCountdown(seconds)}</Text>
          </FadeSlideIn>

          <View style={styles.summaryCard}>
            <Text style={styles.hotelName}>{hotelName}</Text>
            <Text style={styles.caption}>{roomName} · {planName}</Text>
            <Text style={styles.caption}>{MEAL_PLAN_LABEL[hold.quote.ratePlan.mealPlan] ?? ''}</Text>
            <Text style={styles.caption}>{stay.checkIn} → {stay.checkOut} · {stay.nights} night{stay.nights === 1 ? '' : 's'}</Text>
            <Text style={styles.caption}>{cancellationPolicy.description}</Text>

            <View style={styles.divider} />
            <Row label="Subtotal" value={formatMoneyMinor(totals.subtotal, totals.currency)} />
            {totals.discount > 0 && <Row label="Discount" value={`−${formatMoneyMinor(totals.discount, totals.currency)}`} />}
            <Row label="Taxes" value={formatMoneyMinor(totals.taxes, totals.currency)} />
            <Row label="Fees" value={formatMoneyMinor(totals.fees, totals.currency)} />
            <View style={styles.divider} />
            <Row label="Total" value={formatMoneyMinor(totals.total, totals.currency)} strong />
          </View>

          <Text style={styles.sectionTitle}>Lead guest details</Text>
          <AppInput label="First name" value={contact.firstName} onChangeText={(v) => setContact((c) => ({ ...c, firstName: v }))} />
          <AppInput label="Last name" value={contact.lastName} onChangeText={(v) => setContact((c) => ({ ...c, lastName: v }))} />
          <AppInput label="Email" value={contact.email} onChangeText={(v) => setContact((c) => ({ ...c, email: v }))} autoCapitalize="none" keyboardType="email-address" />
          <AppInput label="Mobile number" value={contact.mobile} onChangeText={(v) => setContact((c) => ({ ...c, mobile: v }))} keyboardType="phone-pad" />
          <AppInput label="Special requests (optional)" value={specialRequest} onChangeText={setSpecialRequest} multiline />

          {saveError && <Text style={styles.error}>{saveError}</Text>}
          <AppButton title="Continue to payment" onPress={onContinue} loading={saving} disabled={!canSubmit} style={styles.submit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function Row({ label, value, strong }) {
  return (
    <View style={styles.row}>
      <Text style={styles.caption}>{label}</Text>
      <Text style={strong ? styles.totalValue : styles.caption}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  timerBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, backgroundColor: colors.warning50, borderRadius: radius.control, padding: spacing.md },
  timerBannerUrgent: { backgroundColor: colors.danger50 },
  timerText: { ...typography.bodyStrong, color: colors.warning600 },
  timerTextUrgent: { color: colors.danger600 },
  summaryCard: { backgroundColor: colors.surfaceCard, borderRadius: radius.card, padding: spacing.lg, gap: 4, borderWidth: 1, borderColor: colors.borderSubtle, ...shadow.card },
  hotelName: { ...typography.h1, color: colors.textStrong },
  caption: { ...typography.caption, color: colors.textMuted },
  divider: { height: 1, backgroundColor: colors.borderSubtle, marginVertical: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  totalValue: { ...typography.bodyStrong, color: colors.textStrong },
  sectionTitle: { ...typography.h2, color: colors.textStrong, marginTop: spacing.sm },
  error: { ...typography.caption, color: colors.danger600 },
  submit: { marginTop: spacing.sm, marginBottom: spacing.xxxl },
});
