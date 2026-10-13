import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorView } from '../components/ErrorView.js';
import { LoadingView } from '../components/LoadingView.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { AppButton } from '../components/AppButton.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { bookingsApi } from '../api/bookingsApi.js';
import { formatMoneyMinor, formatStayDate } from '../utils/format.js';
import { BOOKING_STATUS_LABEL } from '../constants/booking.js';
import { useAuth } from '../context/AuthContext.js';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

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

  return (
    <ScreenContainer>
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
            return (
              <FadeSlideIn delay={Math.min(index, 4) * 50}>
                <Pressable style={[styles.card, shadow.card]} onPress={() => navigation.navigate('BookingDetails', { bookingId: trip.id })}>
                  <Image source={trip.hotel.imageUrl ? { uri: trip.hotel.imageUrl } : undefined} style={styles.image} contentFit="cover" placeholder={{ color: colors.surfaceMuted }} />
                  <View style={styles.cardBody}>
                    <View style={styles.row}>
                      <Text style={styles.hotelName} numberOfLines={1}>{trip.hotel.name}</Text>
                      <StatusBadge label={statusInfo.label} tone={statusInfo.tone} />
                    </View>
                    <Text style={styles.caption}>{trip.hotel.city} · {trip.roomName}</Text>
                    <Text style={styles.caption}>{formatStayDate(trip.checkIn, { day: 'numeric', month: 'short' })} → {formatStayDate(trip.checkOut, { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                    <View style={styles.row}>
                      <Text style={styles.bookingRef}>{trip.bookingRef}</Text>
                      <View style={styles.priceRow}>
                        <Text style={styles.price}>{formatMoneyMinor(trip.totalMinor, trip.currency)}</Text>
                        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                      </View>
                    </View>
                  </View>
                </Pressable>
              </FadeSlideIn>
            );
          }}
        />
      )}
    </ScreenContainer>
  );
}

const EMPTY_MESSAGE = {
  upcoming: 'No upcoming trips yet. When you book a stay it will appear here.',
  completed: 'Completed stays will appear here.',
  cancelled: 'Cancelled bookings will appear here.',
};

const styles = StyleSheet.create({
  tabRow: { flexDirection: 'row', padding: spacing.lg, gap: spacing.sm },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.surfaceMuted },
  tabActive: { backgroundColor: colors.brand600 },
  tabText: { ...typography.caption, fontWeight: '600', color: colors.textBody },
  tabTextActive: { color: colors.white },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { flexDirection: 'row', backgroundColor: colors.surfaceCard, borderRadius: radius.card, overflow: 'hidden', marginBottom: spacing.md },
  image: { width: 90, height: 90, backgroundColor: colors.surfaceMuted },
  cardBody: { flex: 1, padding: spacing.md, gap: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  hotelName: { ...typography.bodyStrong, color: colors.textStrong, flexShrink: 1 },
  caption: { ...typography.caption, color: colors.textMuted },
  bookingRef: { ...typography.tiny, color: colors.textMuted, fontFamily: 'monospace' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  price: { ...typography.bodyStrong, color: colors.textStrong },
});
