import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorView } from '../components/ErrorView.js';
import { LoadingView } from '../components/LoadingView.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { AppButton } from '../components/AppButton.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { ExtendStayModal } from '../components/ExtendStayModal.js';
import { WriteReviewModal } from '../components/WriteReviewModal.js';
import { bookingsApi } from '../api/bookingsApi.js';
import { resolveImageUrl } from '../utils/imageUrl.js';
import { formatMoneyMinor, formatStayDate } from '../utils/format.js';
import { BOOKING_STATUS_LABEL } from '../constants/booking.js';
import { useAuth } from '../context/AuthContext.js';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

const INVOICEABLE_STATUSES = ['CONFIRMED', 'REFUND_PENDING', 'REFUNDED'];

const TABS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function MyTripsScreen({ navigation }) {
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState('upcoming');
  const [state, setState] = useState({ status: 'loading', items: [], error: null });
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [extendingTrip, setExtendingTrip] = useState(null);
  const [reviewingTrip, setReviewingTrip] = useState(null);

  const load = useCallback(() => {
    if (!isAuthenticated) return;
    setState((s) => ({ ...s, status: 'loading' }));
    bookingsApi
      .myTrips(tab)
      .then((data) => setState({ status: 'ready', items: data.items ?? [], error: null }))
      .catch((err) => setState({ status: 'error', items: [], error: err.message }));
  }, [tab, isAuthenticated]);

  useEffect(load, [load]);

  if (!isAuthenticated) {
    return (
      <ScreenContainer>
        <View style={styles.header}>
          <Text style={styles.title}>My Trips</Text>
        </View>
        <EmptyState
          icon="briefcase-outline"
          title="Sign in to see your trips"
          message="Your bookings, past and upcoming, live here once you're signed in."
          action={<AppButton title="Sign in" onPress={() => navigation.navigate('Auth', { screen: 'Login' })} />}
        />
      </ScreenContainer>
    );
  }

  const onRefresh = async () => {
    setRefreshing(true);
    load();
    setRefreshing(false);
  };

  const handleDownloadInvoice = async (trip) => {
    setDownloadingId(trip.id);
    try {
      const data = await bookingsApi.invoice(trip.id);
      const file = new File(Paths.cache, `${trip.bookingRef}-invoice.pdf`);
      if (file.exists) file.delete();
      file.write(new Uint8Array(data));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/pdf',
          dialogTitle: `${trip.bookingRef} invoice`,
        });
      } else {
        Alert.alert('Invoice saved', `Saved to ${file.uri}`);
      }
    } catch (err) {
      Alert.alert('Could not download invoice', err.message ?? 'Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <ScreenContainer>
      {/* ── Screen Title Header ── */}
      <View style={styles.header}>
        <Text style={styles.title}>My Trips</Text>
      </View>

      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <Pressable key={t.value} style={[styles.tab, tab === t.value && styles.tabActive]} onPress={() => setTab(t.value)}>
            <Text style={[styles.tabText, tab === t.value && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {state.status === 'loading' && <LoadingView label="Loading your trips…" />}
      {state.status === 'error' && <ErrorView message={state.error} onRetry={load} />}
      {state.status === 'ready' && state.items.length === 0 && (
        <EmptyState icon="briefcase-outline" title="No trips here yet" message={EMPTY_MESSAGE[tab]} />
      )}
      {state.status === 'ready' && state.items.length > 0 && (
        <FlatList
          data={state.items}
          keyExtractor={(t) => String(t.id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand600} />}
          renderItem={({ item: trip, index }) => {
            const statusInfo = BOOKING_STATUS_LABEL[trip.status] ?? BOOKING_STATUS_LABEL.PAYMENT_PENDING;
            const canInvoice = INVOICEABLE_STATUSES.includes(trip.status);
            const canExtend = tab === 'upcoming' && trip.status === 'CONFIRMED';
            const canReview = tab === 'completed';
            return (
              <FadeSlideIn delay={Math.min(index, 4) * 50}>
                <View style={[styles.card, shadow.card]}>
                  <Pressable
                    style={styles.cardMain}
                    onPress={() => navigation.navigate('BookingDetails', { bookingId: trip.id })}
                  >
                    <Image
                      source={resolveImageUrl(trip.hotel.imageUrl) ? { uri: resolveImageUrl(trip.hotel.imageUrl) } : undefined}
                      style={styles.image}
                      contentFit="cover"
                      placeholder={{ color: colors.surfaceMuted }}
                    />
                    <View style={styles.cardBody}>
                      <View style={styles.row}>
                        <Text style={styles.hotelName} numberOfLines={1}>{trip.hotel.name}</Text>
                        <StatusBadge label={statusInfo.label} tone={statusInfo.tone} />
                      </View>
                      <Text style={styles.caption}>{trip.hotel.city} · {trip.roomName}</Text>
                      <Text style={styles.caption}>
                        {formatStayDate(trip.checkIn, { day: 'numeric', month: 'short' })} → {formatStayDate(trip.checkOut, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                      <View style={styles.row}>
                        <Text style={styles.bookingRef}>{trip.bookingRef}</Text>
                        <Text style={styles.price}>{formatMoneyMinor(trip.totalMinor, trip.currency)}</Text>
                      </View>
                    </View>
                  </Pressable>

                  {/* ── Card Bottom Actions Bar ── */}
                  <View style={styles.cardActions}>
                    <View style={styles.leftActions}>
                      {canInvoice && (
                        <Pressable
                          style={styles.actionPill}
                          onPress={() => handleDownloadInvoice(trip)}
                          disabled={downloadingId === trip.id}
                          accessibilityLabel="Download invoice"
                        >
                          {downloadingId === trip.id ? (
                            <ActivityIndicator size="small" color={colors.brand600} style={styles.actionIcon} />
                          ) : (
                            <Ionicons name="document-text-outline" size={13} color={colors.brand600} style={styles.actionIcon} />
                          )}
                          <Text style={styles.actionPillText}>Invoice</Text>
                        </Pressable>
                      )}

                      {canReview && (
                        <Pressable
                          style={[styles.actionPill, styles.reviewPill]}
                          onPress={() => setReviewingTrip(trip)}
                          accessibilityLabel="Write a review"
                        >
                          <Ionicons name="star-outline" size={13} color={colors.accent600} style={styles.actionIcon} />
                          <Text style={[styles.actionPillText, styles.reviewPillText]}>Review</Text>
                        </Pressable>
                      )}

                      {canExtend && (
                        <Pressable
                          style={styles.actionPill}
                          onPress={() => setExtendingTrip(trip)}
                          accessibilityLabel="Extend stay"
                        >
                          <Ionicons name="calendar-outline" size={13} color={colors.brand600} style={styles.actionIcon} />
                          <Text style={styles.actionPillText}>Extend</Text>
                        </Pressable>
                      )}
                    </View>

                    <Pressable
                      style={styles.viewDetailsRow}
                      onPress={() => navigation.navigate('BookingDetails', { bookingId: trip.id })}
                      accessibilityLabel="View details"
                    >
                      <Text style={styles.viewDetailsText}>View details</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.brand600} />
                    </Pressable>
                  </View>
                </View>
              </FadeSlideIn>
            );
          }}
        />
      )}

      {/* ── Extend Stay Modal ── */}
      <ExtendStayModal
        booking={extendingTrip}
        visible={Boolean(extendingTrip)}
        onClose={() => setExtendingTrip(null)}
        onExtended={() => {
          setExtendingTrip(null);
          load();
        }}
      />

      {/* ── Write Review Modal ── */}
      <WriteReviewModal
        visible={Boolean(reviewingTrip)}
        bookingId={reviewingTrip?.id}
        hotelName={reviewingTrip?.hotel?.name}
        onClose={() => setReviewingTrip(null)}
        onSubmitted={() => setReviewingTrip(null)}
      />
    </ScreenContainer>
  );
}

const EMPTY_MESSAGE = {
  upcoming: 'No upcoming trips yet. When you book a stay it will appear here.',
  completed: 'Completed stays will appear here.',
  cancelled: 'Cancelled bookings will appear here.',
};

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  title: {
    ...typography.display,
    fontSize: 26,
    color: colors.textStrong,
  },
  tabRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.surfaceMuted },
  tabActive: { backgroundColor: colors.brand600 },
  tabText: { ...typography.caption, fontWeight: '600', color: colors.textBody },
  tabTextActive: { color: colors.white },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { backgroundColor: colors.surfaceCard, borderRadius: radius.card, overflow: 'hidden', marginBottom: spacing.md },
  cardMain: { flexDirection: 'row' },
  image: { width: 95, height: 95, backgroundColor: colors.surfaceMuted },
  cardBody: { flex: 1, padding: spacing.md, gap: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  hotelName: { ...typography.bodyStrong, color: colors.textStrong, flexShrink: 1 },
  caption: { ...typography.caption, color: colors.textMuted },
  bookingRef: { ...typography.tiny, color: colors.textMuted, fontFamily: 'monospace' },
  price: { ...typography.bodyStrong, color: colors.textStrong },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.brand50,
    borderWidth: 1,
    borderColor: colors.brand100,
  },
  reviewPill: {
    backgroundColor: colors.accent50,
    borderColor: colors.accent200,
  },
  reviewPillText: {
    color: colors.accent700,
  },
  actionIcon: {
    marginRight: 4,
  },
  actionPillText: {
    ...typography.tiny,
    fontWeight: '600',
    color: colors.brand700,
  },
  viewDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingLeft: spacing.sm,
    gap: 2,
  },
  viewDetailsText: {
    ...typography.captionStrong,
    color: colors.brand600,
    fontSize: 13,
  },
});
