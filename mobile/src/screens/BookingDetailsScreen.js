import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { LoadingView } from '../components/LoadingView.js';
import { ErrorView } from '../components/ErrorView.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { AppButton } from '../components/AppButton.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { bookingsApi } from '../api/bookingsApi.js';
import { formatMoneyMinor, formatStayDate } from '../utils/format.js';
import { BOOKING_STATUS_LABEL } from '../constants/booking.js';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

export default function BookingDetailsScreen({ route, navigation }) {
  const { bookingId } = route.params;
  const [state, setState] = useState({ status: 'loading', booking: null, error: null });
  const [cancelling, setCancelling] = useState(false);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);

  const load = () => {
    setState((s) => ({ ...s, status: 'loading' }));
    bookingsApi
      .booking(bookingId)
      .then((booking) => setState({ status: 'ready', booking, error: null }))
      .catch((err) => setState({ status: 'error', booking: null, error: err.message }));
  };

  useEffect(load, [bookingId]);

  if (state.status === 'loading') return <LoadingView label="Loading trip details…" />;
  if (state.status === 'error') return <ErrorView message={state.error} onRetry={load} />;

  const { booking } = state;
  const statusInfo = BOOKING_STATUS_LABEL[booking.status] ?? BOOKING_STATUS_LABEL.PAYMENT_PENDING;
  const canCancel = booking.status === 'CONFIRMED' && booking.cancellation?.preview?.canCancel;
  // A payment that stalled (app closed mid-checkout, card declined, etc.) leaves the booking here with
  // no way back into Payment -- holdId lets us resume the SAME booking (payment.service.js#createOrder's
  // `hold.booking_id` branch reuses it) rather than starting over. If the underlying hold has since
  // expired, PaymentScreen's own existing error handling already surfaces that clearly on retry.
  const canResumePayment = booking.status === 'PAYMENT_PENDING' && Boolean(booking.holdId);
  // Matches the website's own gate exactly (BookingConfirmationPage.jsx): an invoice is only offered once
  // the booking is actually CONFIRMED, even though the backend's invoice service itself has no status
  // check -- a PAYMENT_PENDING/FAILED booking has nothing real to invoice yet.
  const canDownloadInvoice = booking.status === 'CONFIRMED';

  const onDownloadInvoice = async () => {
    setDownloadingInvoice(true);
    try {
      const data = await bookingsApi.invoice(bookingId);
      const file = new File(Paths.cache, `${booking.bookingRef}-invoice.pdf`);
      if (file.exists) file.delete();
      file.write(new Uint8Array(data));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: `${booking.bookingRef} invoice` });
      } else {
        Alert.alert('Invoice saved', `Saved to ${file.uri}`);
      }
    } catch (err) {
      Alert.alert('Could not download invoice', err.message ?? 'Please try again.');
    } finally {
      setDownloadingInvoice(false);
    }
  };

  const onCancel = () => {
    Alert.alert('Cancel this booking?', booking.cancellation?.preview?.canCancel ? `You will be refunded ${formatMoneyMinor(booking.cancellation.preview.refundMinor, booking.amounts.currency)}.` : 'This action cannot be undone.', [
      { text: 'Keep booking', style: 'cancel' },
      {
        text: 'Cancel booking',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            await bookingsApi.cancel(bookingId);
            load();
          } catch (err) {
            Alert.alert('Could not cancel', err.message);
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  return (
    <ScreenContainer edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <FadeSlideIn>
        <View style={styles.headerRow}>
          <Text style={styles.hotelName}>{booking.hotel.name}</Text>
          <StatusBadge label={statusInfo.label} tone={statusInfo.tone} />
        </View>
        <Text style={styles.caption}>{booking.hotel.address}</Text>
        <Text style={styles.bookingRef}>{booking.bookingRef}</Text>

        {canResumePayment && (
          <AppButton
            title="Resume payment"
            onPress={() => navigation.navigate('Payment', { holdId: booking.holdId, hotelName: booking.hotel.name })}
            icon={<Ionicons name="card-outline" size={16} color={colors.white} />}
            style={styles.resumeButton}
          />
        )}

        <Section title="Stay">
          <Row label="Dates" value={`${formatStayDate(booking.stay.checkIn)} → ${formatStayDate(booking.stay.checkOut)} (${booking.stay.nights} night${booking.stay.nights === 1 ? '' : 's'})`} />
          <Row label="Rooms" value={booking.rooms.map((r) => `${r.quantity} × ${r.name}`).join(', ')} />
          <Row label="Rate plan" value={booking.rooms[0]?.ratePlanName} />
        </Section>

        <Section title="Lead guest">
          <Row label="Name" value={`${booking.primaryContact.firstName} ${booking.primaryContact.lastName}`} />
          <Row label="Email" value={booking.primaryContact.email} />
          <Row label="Mobile" value={booking.primaryContact.mobile} />
        </Section>

        {booking.specialRequest ? (
          <Section title="Special requests">
            <Text style={styles.value}>{booking.specialRequest}</Text>
          </Section>
        ) : null}

        <Section title="Price">
          <Row label="Subtotal" value={formatMoneyMinor(booking.amounts.subtotal, booking.amounts.currency)} />
          {booking.amounts.discount > 0 && <Row label="Discount" value={`−${formatMoneyMinor(booking.amounts.discount, booking.amounts.currency)}`} />}
          <Row label="Taxes" value={formatMoneyMinor(booking.amounts.taxes, booking.amounts.currency)} />
          <Row label="Fees" value={formatMoneyMinor(booking.amounts.fees, booking.amounts.currency)} />
          {booking.amounts.couponDiscount > 0 && <Row label={`Coupon (${booking.amounts.couponCode})`} value={`−${formatMoneyMinor(booking.amounts.couponDiscount, booking.amounts.currency)}`} />}
          <Row label="Total" value={formatMoneyMinor(booking.amounts.total, booking.amounts.currency)} strong />
          <Row label="Paid" value={formatMoneyMinor(booking.amounts.paid, booking.amounts.currency)} />
          {canDownloadInvoice && (
            <AppButton
              title="Download invoice"
              variant="secondary"
              size="sm"
              loading={downloadingInvoice}
              onPress={onDownloadInvoice}
              icon={<Ionicons name="document-text-outline" size={16} color={colors.textStrong} />}
              style={styles.invoiceButton}
            />
          )}
        </Section>

        {booking.cancellation ? (
          <Section title="Cancellation policy">
            <Text style={styles.value}>{booking.cancellation.description}</Text>
          </Section>
        ) : null}

        {canCancel && (
          <AppButton title="Cancel booking" variant="danger" onPress={onCancel} loading={cancelling} style={styles.cancelButton} />
        )}
        </FadeSlideIn>
      </ScrollView>
    </ScreenContainer>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value, strong }) {
  return (
    <View style={styles.row}>
      <Text style={styles.caption}>{label}</Text>
      <Text style={strong ? styles.strongValue : styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  hotelName: { ...typography.display, color: colors.textStrong, flex: 1 },
  caption: { ...typography.caption, color: colors.textMuted },
  bookingRef: { ...typography.caption, color: colors.textMuted, fontFamily: 'monospace', marginBottom: spacing.md },
  section: { backgroundColor: colors.surfaceCard, borderRadius: radius.card, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderSubtle, marginBottom: spacing.md, gap: spacing.xs, ...shadow.card },
  sectionTitle: { ...typography.h2, color: colors.textStrong, marginBottom: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  value: { ...typography.caption, color: colors.textStrong, flexShrink: 1, textAlign: 'right' },
  strongValue: { ...typography.bodyStrong, color: colors.textStrong },
  cancelButton: { marginTop: spacing.sm, marginBottom: spacing.xxxl },
  resumeButton: { marginBottom: spacing.md },
  invoiceButton: { marginTop: spacing.sm, alignSelf: 'flex-start' },
});
