import { useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { LoadingView } from '../components/LoadingView.js';
import { ErrorView } from '../components/ErrorView.js';
import { EmptyState } from '../components/EmptyState.js';
import { AppButton } from '../components/AppButton.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { hotelsApi } from '../api/hotelsApi.js';
import { bookingsApi } from '../api/bookingsApi.js';
import { formatOccupancy, formatMoneyMinor, nightsBetween } from '../utils/format.js';
import { MEAL_PLAN_LABEL } from '../constants/booking.js';
import { useAuth } from '../context/AuthContext.js';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

const CONTENT_PADDING = spacing.lg;

const UNAVAILABLE_TEXT = {
  SOLD_OUT: 'Sold out for these dates',
  CAPACITY: 'Does not fit your party',
  CLOSED: 'Closed for these dates',
  STAY_LENGTH: 'Not available for this length of stay',
  NO_RATES: 'No rates available for these dates',
};

/**
 * Real, date/occupancy-aware availability -- the exact API the website's hotel-details page uses.
 * Selecting a rate plan creates a REAL hold through the existing booking-hold service; nothing about
 * price or availability is computed here.
 */
export default function RoomSelectionScreen({ route, navigation }) {
  const { hotelId, hotelSlug, hotelName, checkIn, checkOut, occupancy } = route.params;
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [holdBusy, setHoldBusy] = useState(false);
  const nights = nightsBetween(checkIn, checkOut);
  const { width } = useWindowDimensions();
  const cardWidth = width - CONTENT_PADDING * 2;

  useEffect(() => {
    hotelsApi
      .availability(hotelSlug, { checkIn, checkOut, occ: formatOccupancy(occupancy) })
      .then((data) => setState({ status: 'ready', data, error: null }))
      .catch((err) => setState({ status: 'error', data: null, error: err.message }));
  }, [hotelSlug, checkIn, checkOut, occupancy]);

  const selectRatePlan = async (room, plan) => {
    if (!isAuthenticated) {
      navigation.navigate('Auth', { screen: 'Login' });
      return;
    }
    setHoldBusy(true);
    try {
      const hold = await bookingsApi.createHold({
        hotelId,
        roomTypeId: room.id,
        ratePlanId: plan.ratePlanId,
        checkIn,
        checkOut,
        rooms: occupancy.length,
        occupancy,
      });
      navigation.navigate('Booking', { holdId: hold.id, hotelName, roomName: room.name, planName: plan.name });
    } catch (err) {
      setState((s) => ({ ...s, error: err.message }));
    } finally {
      setHoldBusy(false);
    }
  };

  if (state.status === 'loading') return <LoadingView label="Checking real availability…" />;
  if (state.status === 'error' && !state.data) return <ErrorView message={state.error} onRetry={() => navigation.replace('RoomSelection', route.params)} />;

  const available = state.data.roomTypes.filter((r) => r.available);
  const unavailable = state.data.roomTypes.filter((r) => !r.available);

  return (
    <ScreenContainer edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>{hotelName} · {nights} night{nights === 1 ? '' : 's'}</Text>

        {available.length === 0 && (
          <EmptyState icon="bed-outline" title="No rooms available" message="Try different dates or go back to results." />
        )}

        {available.map((room, index) => (
          <FadeSlideIn key={room.id} delay={index * 60} style={styles.roomCard}>
            <FlatList
              data={room.images?.length ? room.images : [null]}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(img, i) => img?.id ?? `ph-${i}`}
              renderItem={({ item }) => (
                <Image source={item?.url ? { uri: item.url } : undefined} style={[styles.roomImage, { width: cardWidth }]} contentFit="cover" placeholder={{ color: colors.surfaceMuted }} />
              )}
            />
            <View style={styles.roomBody}>
              <Text style={styles.roomName}>{room.name}</Text>
              <View style={styles.metaRow}>
                {room.roomSizeSqm != null && <Text style={styles.caption}>{room.roomSizeSqm} m²</Text>}
                <Text style={styles.caption}>Up to {room.maxAdults} adult{room.maxAdults === 1 ? '' : 's'}{room.maxChildren > 0 ? `, ${room.maxChildren} child${room.maxChildren === 1 ? '' : 'ren'}` : ''}</Text>
              </View>
              {room.availableRooms > 0 && room.availableRooms <= 3 && (
                <Text style={styles.scarceText}>Only {room.availableRooms} room{room.availableRooms === 1 ? '' : 's'} left</Text>
              )}

              {room.ratePlans.map((plan) => (
                <View key={plan.ratePlanId} style={styles.planRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.caption}>{MEAL_PLAN_LABEL[plan.mealPlan] ?? ''}</Text>
                    <View style={styles.row}>
                      <Ionicons
                        name={plan.refundable ? 'shield-checkmark-outline' : 'close-circle-outline'}
                        size={13}
                        color={plan.refundable ? colors.success600 : colors.danger600}
                      />
                      <Text style={[styles.caption, { color: plan.refundable ? colors.success600 : colors.danger600 }]}>
                        {plan.refundable ? 'Refundable' : 'Non-refundable'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.priceCol}>
                    <Text style={styles.price}>{formatMoneyMinor(plan.pricePerNight)}</Text>
                    <Text style={styles.caption}>/ night</Text>
                    <Text style={styles.caption}>{formatMoneyMinor(plan.finalAmount)} total</Text>
                    <AppButton title="Select" size="sm" loading={holdBusy} onPress={() => selectRatePlan(room, plan)} style={styles.selectButton} />
                  </View>
                </View>
              ))}
            </View>
          </FadeSlideIn>
        ))}

        {unavailable.length > 0 && (
          <View style={styles.unavailableBlock}>
            <Text style={styles.sectionTitle}>{unavailable.length} other room type{unavailable.length === 1 ? '' : 's'} not available</Text>
            {unavailable.map((room) => (
              <View key={room.id} style={styles.row}>
                <Text style={styles.caption}>{room.name}</Text>
                <Text style={styles.caption}>{UNAVAILABLE_TEXT[room.unavailableReason] ?? 'Not available'}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  subtitle: { ...typography.caption, color: colors.textMuted },
  roomCard: { backgroundColor: colors.surfaceCard, borderRadius: radius.card, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderSubtle, ...shadow.card },
  roomImage: { height: 160, backgroundColor: colors.surfaceMuted },
  roomBody: { padding: spacing.lg, gap: spacing.xs },
  roomName: { ...typography.h2, color: colors.textStrong },
  metaRow: { flexDirection: 'row', gap: spacing.md },
  caption: { ...typography.caption, color: colors.textMuted },
  scarceText: { ...typography.tiny, color: colors.warning600, fontWeight: '700' },
  planRow: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.md, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  flex1: { flex: 1 },
  planName: { ...typography.bodyStrong, color: colors.textStrong },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priceCol: { alignItems: 'flex-end', gap: 2 },
  price: { ...typography.h2, color: colors.textStrong },
  selectButton: { marginTop: spacing.xs, minWidth: 90 },
  unavailableBlock: { padding: spacing.lg, backgroundColor: colors.surfaceMuted, borderRadius: radius.card, gap: spacing.xs },
  sectionTitle: { ...typography.bodyStrong, color: colors.textStrong, marginBottom: spacing.xs },
});
