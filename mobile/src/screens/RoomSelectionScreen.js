import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { LoadingView } from '../components/LoadingView.js';
import { ErrorView } from '../components/ErrorView.js';
import { EmptyState } from '../components/EmptyState.js';
import { AppButton } from '../components/AppButton.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { hotelsApi } from '../api/hotelsApi.js';
import { bookingsApi } from '../api/bookingsApi.js';
import { formatOccupancy, formatMoneyMinor, nightsBetween } from '../utils/format.js';
import { MEAL_PLAN_LABEL, BED_TYPE_LABEL } from '../constants/booking.js';
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

/** One meta fact about a room (size, bed, view, occupancy) -- icon + text, wraps on narrow screens so
 * nothing clips when a room has every one of these facts at once. */
function MetaItem({ icon, text }) {
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={13} color={colors.brand600} />
      <Text style={styles.caption}>{text}</Text>
    </View>
  );
}

function BreakdownRow({ label, value, tone, strong }) {
  return (
    <View style={styles.breakdownRow}>
      <Text style={[styles.caption, strong && styles.breakdownStrongLabel]}>{label}</Text>
      <Text style={[styles.caption, tone === 'success' && styles.successText, strong && styles.breakdownStrongValue]}>{value}</Text>
    </View>
  );
}

/**
 * Each rate plan compared side by side: what it includes, its real refund rule (from the plan's own
 * cancellationPolicy, never guessed from `refundable` alone), and an expandable price breakdown -- mirrors
 * the website's RoomOffers.jsx#RatePlanRow field-for-field, including the exact free-cancellation
 * definition (refundable AND a policy AND not non-refundable AND a full 100% refund window).
 */
function RatePlanRow({ plan, onSelect, holdBusy }) {
  const [open, setOpen] = useState(false);
  const cancelText = plan.cancellationPolicy?.description ?? 'Cancellation terms are not set for this rate.';
  const freeCancel = plan.refundable && plan.cancellationPolicy && !plan.cancellationPolicy.isNonRefundable && plan.cancellationPolicy.refundPercent === 100;
  const discountPercent = plan.discount > 0 ? Math.round((plan.discount / plan.subtotal) * 100) : null;

  return (
    <View style={styles.planRow}>
      <View style={styles.planHeaderRow}>
        <Text style={styles.planName}>{plan.name}</Text>
        <StatusBadge label={MEAL_PLAN_LABEL[plan.mealPlan] ?? 'Room only'} tone="brand" />
      </View>

      <View style={styles.badgeRow}>
        {plan.refundable ? (
          freeCancel ? <StatusBadge label="Free cancellation" tone="success" /> : <StatusBadge label="Partly refundable" tone="neutral" />
        ) : (
          <StatusBadge label="Non-refundable" tone="danger" />
        )}
        {discountPercent > 0 && <StatusBadge label={`${discountPercent}% OFF`} tone="premium" />}
      </View>
      <Text style={styles.cancelText}>{cancelText}</Text>

      <View style={styles.priceFooter}>
        <View style={styles.flex1}>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatMoneyMinor(plan.pricePerNight)}</Text>
            <Text style={styles.caption}> / night</Text>
          </View>
          <Text style={styles.caption}>
            {plan.nights} night{plan.nights === 1 ? '' : 's'}{plan.rooms > 1 ? ` · ${plan.rooms} rooms` : ''} · {formatMoneyMinor(plan.finalAmount)} total
          </Text>
        </View>
        <AppButton title="Select" size="sm" loading={holdBusy} onPress={() => onSelect(plan)} style={styles.selectButton} />
      </View>

      <Pressable style={styles.breakdownToggle} onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.brand600} />
        <Text style={styles.breakdownToggleText}>Price breakdown</Text>
      </Pressable>
      {open && (
        <View style={styles.breakdown}>
          <BreakdownRow label={`Room charge (${plan.nights} night${plan.nights === 1 ? '' : 's'})`} value={formatMoneyMinor(plan.subtotal)} />
          {plan.discount > 0 && <BreakdownRow label="Discount" value={`−${formatMoneyMinor(plan.discount)}`} tone="success" />}
          <BreakdownRow label="Taxes" value={formatMoneyMinor(plan.taxes)} />
          <BreakdownRow label="Fees" value={formatMoneyMinor(plan.fees)} />
          <BreakdownRow label="Total" value={formatMoneyMinor(plan.finalAmount)} strong />
        </View>
      )}
    </View>
  );
}

/** One room type: its own photo gallery (with the same dots/count treatment as HotelDetailsScreen, for a
 * consistent gallery language across the app), real facts (size, bed, view, occupancy, amenities), and
 * every sellable rate plan. */
function RoomCard({ room, onSelect, holdBusy }) {
  const { width } = useWindowDimensions();
  const cardWidth = width - CONTENT_PADDING * 2;
  const [activeImage, setActiveImage] = useState(0);
  const images = room.images?.length ? room.images : [null];
  const scarce = room.availableRooms > 0 && room.availableRooms <= 3;

  return (
    <View style={styles.roomCard}>
      <View>
        <FlatList
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(img, i) => img?.id ?? `ph-${i}`}
          onMomentumScrollEnd={(e) => setActiveImage(Math.round(e.nativeEvent.contentOffset.x / cardWidth))}
          renderItem={({ item }) => (
            <Image source={item?.url ? { uri: item.url } : undefined} style={[styles.roomImage, { width: cardWidth }]} contentFit="cover" placeholder={{ color: colors.surfaceMuted }} />
          )}
        />
        {images.length > 1 && (
          <View style={styles.dotsRow} pointerEvents="none">
            {images.map((_, i) => (
              <View key={i} style={[styles.dot, i === activeImage && styles.dotActive]} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.roomBody}>
        <Text style={styles.roomName}>{room.name}</Text>
        <View style={styles.metaRow}>
          {room.roomSizeSqm != null && <MetaItem icon="resize-outline" text={`${room.roomSizeSqm} m²`} />}
          {room.bedType && <MetaItem icon="bed-outline" text={`${BED_TYPE_LABEL[room.bedType] ?? room.bedType}${room.bedCount > 1 ? ` × ${room.bedCount}` : ''}`} />}
          {room.view && <MetaItem icon="eye-outline" text={room.view} />}
          <MetaItem icon="people-outline" text={`Up to ${room.maxAdults} adult${room.maxAdults === 1 ? '' : 's'}${room.maxChildren > 0 ? `, ${room.maxChildren} child${room.maxChildren === 1 ? '' : 'ren'}` : ''}`} />
        </View>

        {room.amenities?.length > 0 && (
          <View style={styles.amenitiesRow}>
            {room.amenities.slice(0, 6).map((a) => (
              <View key={a.code} style={styles.amenityItem}>
                <Ionicons name="checkmark" size={12} color={colors.success600} />
                <Text style={styles.caption}>{a.name}</Text>
              </View>
            ))}
          </View>
        )}

        {scarce && <StatusBadge label={`Only ${room.availableRooms} room${room.availableRooms === 1 ? '' : 's'} left`} tone="warning" />}

        {room.ratePlans.map((plan) => (
          <RatePlanRow key={plan.ratePlanId} plan={plan} onSelect={(p) => onSelect(room, p)} holdBusy={holdBusy} />
        ))}
      </View>
    </View>
  );
}

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
          <FadeSlideIn key={room.id} delay={index * 60}>
            <RoomCard room={room} onSelect={selectRatePlan} holdBusy={holdBusy} />
          </FadeSlideIn>
        ))}

        {unavailable.length > 0 && (
          <View style={styles.unavailableBlock}>
            <Text style={styles.sectionTitle}>{unavailable.length} other room type{unavailable.length === 1 ? '' : 's'} not available</Text>
            {unavailable.map((room) => (
              <View key={room.id} style={styles.unavailableRow}>
                <Ionicons name="close-circle-outline" size={14} color={colors.textMuted} />
                <Text style={[styles.caption, styles.flex1]}>{room.name}</Text>
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
  flex1: { flex: 1 },
  roomCard: { backgroundColor: colors.surfaceCard, borderRadius: radius.card, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderSubtle, ...shadow.card },
  roomImage: { height: 170, backgroundColor: colors.surfaceMuted },
  dotsRow: { position: 'absolute', bottom: spacing.sm, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotActive: { backgroundColor: colors.white, width: 8, height: 8, borderRadius: 4 },
  roomBody: { padding: spacing.lg, gap: spacing.sm },
  roomName: { ...typography.h2, color: colors.textStrong },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  caption: { ...typography.caption, color: colors.textMuted },
  successText: { color: colors.success600 },
  amenitiesRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: 4 },
  amenityItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  planRow: { gap: 4, paddingTop: spacing.md, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  planHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  planName: { ...typography.bodyStrong, color: colors.textStrong },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 },
  cancelText: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  priceFooter: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm },
  priceRow: { flexDirection: 'row', alignItems: 'baseline' },
  price: { ...typography.h2, color: colors.textStrong },
  selectButton: { minWidth: 90 },
  breakdownToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm, alignSelf: 'flex-start' },
  breakdownToggleText: { ...typography.captionStrong, color: colors.brand600 },
  breakdown: { marginTop: spacing.xs, gap: 2 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between' },
  breakdownStrongLabel: { ...typography.captionStrong, color: colors.textStrong },
  breakdownStrongValue: { ...typography.captionStrong, color: colors.textStrong },
  unavailableBlock: { padding: spacing.lg, backgroundColor: colors.surfaceMuted, borderRadius: radius.card, gap: spacing.sm },
  unavailableRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { ...typography.bodyStrong, color: colors.textStrong },
});
