import { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { LoadingView } from '../components/LoadingView.js';
import { AppButton } from '../components/AppButton.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { bookingsApi } from '../api/bookingsApi.js';
import { formatMoneyMinor, formatStayDate } from '../utils/format.js';
import { BOOKING_STATUS_LABEL } from '../constants/booking.js';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

/**
 * Only ever reached after /payments/verify has already returned a CONFIRMED booking from the server --
 * never shown just because the user returned from a payment screen. If the passed-in booking is somehow
 * missing, it is re-fetched rather than assumed.
 */
export default function BookingConfirmationScreen({ route, navigation }) {
  const [booking, setBooking] = useState(route.params?.booking ?? null);
  const iconScale = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (!booking && route.params?.bookingId) {
      bookingsApi.booking(route.params.bookingId).then(setBooking).catch(() => {});
    }
  }, [booking, route.params]);

  useEffect(() => {
    if (!booking) return;
    Animated.spring(iconScale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 10 }).start();
  }, [booking, iconScale]);

  if (!booking) return <LoadingView label="Loading your confirmation…" />;

  const statusInfo = BOOKING_STATUS_LABEL[booking.status] ?? BOOKING_STATUS_LABEL.PAYMENT_PENDING;
  const confirmed = booking.status === 'CONFIRMED';

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View style={[styles.iconWrap, confirmed ? styles.iconWrapSuccess : styles.iconWrapPending, { transform: [{ scale: iconScale }] }]}>
          <Ionicons name={confirmed ? 'checkmark-circle' : 'time'} size={48} color={confirmed ? colors.success600 : colors.warning600} />
        </Animated.View>
        <Text style={styles.title}>{confirmed ? 'Booking confirmed!' : statusInfo.label}</Text>
        <Text style={styles.subtitle}>
          {confirmed ? `Your stay at ${booking.hotel.name} is booked.` : 'We will update you once this is finalised.'}
        </Text>

        <FadeSlideIn delay={120} style={styles.card}>
          <Row label="Booking reference" value={booking.bookingRef} mono />
          <Row label="Hotel" value={booking.hotel.name} />
          <Row label="Dates" value={`${formatStayDate(booking.stay.checkIn)} → ${formatStayDate(booking.stay.checkOut)}`} />
          <Row label="Total paid" value={formatMoneyMinor(booking.amounts.paid, booking.amounts.currency)} strong />
        </FadeSlideIn>

        <AppButton title="View trip details" onPress={() => navigation.replace('BookingDetails', { bookingId: booking.id })} />
        <AppButton title="Back to home" variant="ghost" onPress={() => navigation.popToTop()} />
      </ScrollView>
    </ScreenContainer>
  );
}

function Row({ label, value, strong, mono }) {
  return (
    <View style={styles.row}>
      <Text style={styles.caption}>{label}</Text>
      <Text style={[strong ? styles.strongValue : styles.value, mono && styles.mono]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xxl, alignItems: 'center', gap: spacing.sm },
  iconWrap: { marginTop: spacing.xl, marginBottom: spacing.sm, width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  iconWrapSuccess: { backgroundColor: colors.success50 },
  iconWrapPending: { backgroundColor: colors.warning50 },
  title: { ...typography.display, color: colors.textStrong, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg },
  card: {
    width: '100%', backgroundColor: colors.surfaceCard, borderRadius: radius.card, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.borderSubtle, gap: spacing.sm, marginBottom: spacing.lg, ...shadow.card,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  caption: { ...typography.caption, color: colors.textMuted },
  value: { ...typography.caption, color: colors.textStrong },
  strongValue: { ...typography.bodyStrong, color: colors.textStrong },
  mono: { fontFamily: 'monospace' },
});
