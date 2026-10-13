import { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { DateField } from '../components/DateField.js';
import { DestinationInput } from '../components/DestinationInput.js';
import { GuestsModal } from '../components/GuestsModal.js';
import { AppButton } from '../components/AppButton.js';
import { SectionHeader } from '../components/SectionHeader.js';
import { HotelCard, HotelCardSkeleton } from '../components/HotelCard.js';
import { EmptyState } from '../components/EmptyState.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { hotelsApi } from '../api/hotelsApi.js';
import { notificationsApi } from '../api/notificationsApi.js';
import { useAuth } from '../context/AuthContext.js';
import { todayIso, addDaysIso, occupancyLabel } from '../utils/format.js';
import { validateSearchCriteria } from '../utils/searchValidation.js';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

const DEFAULT_ROOM = { adults: 2, childAges: [] };

/**
 * The home screen pulls two independent pieces of real backend data (popular destinations, handpicked
 * hotels), each used as-is -- nothing hardcoded or invented. Any single section that fails to load simply
 * disappears from the page rather than breaking the whole screen.
 *
 * NOTE: the plain GET /hotels (hotelsApi.featuredHotels) is deliberately NOT used here. Verified live
 * against production: it returns a raw `coverImageId` (a DB id), not a resolved `image.url` the way
 * /hotels/search and /hotels/handpicked do (confirmed from backend/src/services/hotelSearch.service.js's
 * imageFor() helper, which only those two endpoints call) -- there is no public endpoint to resolve that
 * id into a URL. Rendering it with HotelCard would just show a permanently-blank photo, so
 * handpickedHotels() (which already includes a real image) is the one curated list shown here.
 */
export default function HomeScreen({ navigation }) {
  const { user, isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  const [destinations, setDestinations] = useState({ status: 'loading', items: [] });
  const [handpicked, setHandpicked] = useState({ status: 'loading', items: [] });
  const [refreshing, setRefreshing] = useState(false);

  const [destination, setDestination] = useState(null);
  const [destinationText, setDestinationText] = useState('');
  const [checkIn, setCheckIn] = useState(addDaysIso(todayIso(), 1));
  const [checkOut, setCheckOut] = useState(addDaysIso(todayIso(), 2));
  const [room, setRoom] = useState(DEFAULT_ROOM);
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [formError, setFormError] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return Promise.resolve();
    }
    return notificationsApi.unreadCount().then(setUnreadCount).catch(() => {});
  }, [isAuthenticated]);

  const load = useCallback(async () => {
    hotelsApi
      .popularDestinations({ limit: 8 })
      .then((items) => setDestinations({ status: 'ready', items }))
      .catch(() => setDestinations({ status: 'error', items: [] }));
    hotelsApi
      .handpickedHotels({ limit: 10 })
      .then((res) => setHandpicked({ status: 'ready', items: res.items ?? [] }))
      .catch(() => setHandpicked({ status: 'error', items: [] }));
    await loadUnreadCount();
  }, [loadUnreadCount]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openHotel = (hotel) => navigation.navigate('HotelDetails', { idOrSlug: hotel.slug });

  const goToDestination = (item) => {
    navigation.navigate('Search', { destination: item.destination, label: item.label, checkIn, checkOut, occupancy: [room] });
  };

  const onSearchPress = () => {
    const error = validateSearchCriteria(destination, checkIn, checkOut);
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);
    navigation.navigate('Search', { destination: destination.destination, area: destination.area, label: destination.label, checkIn, checkOut, occupancy: [room] });
  };

  return (
    <ScreenContainer edges={['bottom']}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand600} />}
      >
        <View style={styles.heroBand}>
          <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
            {/* The wordmark is navy-on-transparent (assets/logo.png) -- nearly unreadable directly on
                this navy header, so it sits on its own small white card instead of being recolored. */}
            <View style={styles.brandMark}>
              <Image source={require('../../assets/logo.png')} style={styles.brandLogo} resizeMode="contain" accessibilityLabel="Gokaasa" />
            </View>
            <View style={styles.headerActions}>
              {isAuthenticated && (
                <Pressable style={styles.headerIcon} onPress={() => navigation.navigate('Notifications')} accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}>
                  <Ionicons name="notifications-outline" size={20} color={colors.white} />
                  {unreadCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                    </View>
                  )}
                </Pressable>
              )}
              {isAuthenticated && (
                <Pressable style={styles.headerIcon} onPress={() => navigation.navigate('Main', { screen: 'Wishlist' })} accessibilityLabel="Wishlist">
                  <Ionicons name="heart-outline" size={20} color={colors.white} />
                </Pressable>
              )}
              <Pressable style={styles.headerIcon} onPress={() => navigation.navigate('Main', { screen: 'Profile' })} accessibilityLabel="Profile">
                <Ionicons name="person-circle-outline" size={22} color={colors.white} />
              </Pressable>
            </View>
          </View>

          <FadeSlideIn style={styles.hero}>
            <Text style={styles.heroTitle}>Find your perfect stay</Text>
            <Text style={styles.heroSubtitle}>
              {user ? `Welcome back, ${user.firstName}. ` : ''}Real hotels, resorts and villas -- booked with confidence.
            </Text>
          </FadeSlideIn>
        </View>

        <FadeSlideIn delay={80} style={[styles.searchCard, shadow.floating]}>
          <DestinationInput
            text={destinationText}
            onChangeText={setDestinationText}
            selected={destination}
            onSelect={(value) => {
              setDestination(value);
              // A functional updater: DestinationInput calls this with `null` (to clear the prior
              // selection) in the SAME synchronous handler as its own onChangeText(newText) call, right
              // after a keystroke. Reading `destinationText` here directly would capture the
              // pre-keystroke value and silently revert what was just typed -- found and fixed while
              // validating the mobile Booking Assistant, which shares this exact pattern.
              setDestinationText((prev) => value?.label ?? prev);
              setFormError(null);
            }}
            onPickHotel={(item) => navigation.navigate('HotelDetails', { idOrSlug: item.hotelSlug, checkIn, checkOut, occupancy: [room] })}
          />
          <View style={styles.row}>
            <DateField label="Check-in" value={checkIn} onChange={setCheckIn} minimumDate={todayIso()} />
            <DateField label="Check-out" value={checkOut} onChange={setCheckOut} minimumDate={addDaysIso(checkIn, 1)} />
          </View>
          <Pressable style={styles.guestsRow} onPress={() => setGuestsOpen(true)}>
            <Ionicons name="people-outline" size={16} color={colors.brand600} />
            <Text style={styles.guestsText}>{occupancyLabel([room])}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} style={styles.flex1End} />
          </Pressable>

          {formError && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.danger600} />
              <Text style={styles.errorText}>{formError}</Text>
            </View>
          )}

          <AppButton title="Search Hotels" onPress={onSearchPress} style={styles.searchButton} />
        </FadeSlideIn>

        {destinations.items.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Popular destinations" />
            <FlatList
              data={destinations.items}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.destination}
              contentContainerStyle={{ gap: spacing.md }}
              renderItem={({ item }) => (
                <Pressable style={styles.destinationChip} onPress={() => goToDestination(item)}>
                  <View style={styles.destinationIconWrap}>
                    <Ionicons name="location" size={18} color={colors.white} />
                  </View>
                  <Text style={styles.destinationLabel} numberOfLines={1}>{item.label}</Text>
                  {item.hotelCount > 0 && <Text style={styles.destinationCount}>{item.hotelCount} hotel{item.hotelCount === 1 ? '' : 's'}</Text>}
                </Pressable>
              )}
            />
          </View>
        )}

        <View style={styles.section}>
          <SectionHeader title="Handpicked for you" actionLabel="See all" onAction={() => navigation.navigate('Search')} />
          {handpicked.status === 'loading' && (
            <>
              <HotelCardSkeleton />
              <HotelCardSkeleton />
            </>
          )}
          {handpicked.status === 'ready' && handpicked.items.length === 0 && (
            <EmptyState icon="bed-outline" title="No hotels yet" message="Check back soon -- new stays are added regularly." />
          )}
          {handpicked.items.map((hotel, index) => (
            <FadeSlideIn key={hotel.id} delay={Math.min(index, 4) * 50}>
              <HotelCard hotel={hotel} onPress={() => openHotel(hotel)} />
            </FadeSlideIn>
          ))}
        </View>
      </ScrollView>

      <GuestsModal visible={guestsOpen} room={room} onChange={setRoom} onClose={() => setGuestsOpen(false)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxxl },
  heroBand: { backgroundColor: colors.brand700, borderBottomLeftRadius: radius.card * 2, borderBottomRightRadius: radius.card * 2, paddingBottom: 56 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  brandMark: {
    height: 36, paddingHorizontal: spacing.md, borderRadius: radius.control, backgroundColor: colors.surfaceCard,
    alignItems: 'center', justifyContent: 'center', ...shadow.subtle,
  },
  brandLogo: { width: 110, height: 20 },
  headerActions: { flexDirection: 'row', gap: spacing.xs },
  headerIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  badge: {
    position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3,
    backgroundColor: colors.danger600, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.brand700,
  },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: '700', lineHeight: 12 },
  hero: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: 4 },
  heroTitle: { ...typography.hero, color: colors.white },
  heroSubtitle: { ...typography.body, color: 'rgba(255,255,255,0.78)' },
  searchCard: { marginHorizontal: spacing.lg, marginTop: -40, backgroundColor: colors.surfaceCard, borderRadius: radius.card, padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  guestsRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 48, borderRadius: radius.control,
    borderWidth: 1, borderColor: colors.borderSubtle, paddingHorizontal: spacing.md,
  },
  guestsText: { ...typography.body, color: colors.textStrong },
  flex1End: { marginLeft: 'auto' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  errorText: { ...typography.caption, color: colors.danger600, flexShrink: 1 },
  searchButton: { height: 52 },
  section: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  destinationChip: {
    width: 136, height: 112, borderRadius: radius.card, backgroundColor: colors.surfaceCard, padding: spacing.md, gap: 4, ...shadow.card,
  },
  destinationIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brand600, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  destinationLabel: { color: colors.textStrong, fontWeight: '700', fontSize: 14 },
  destinationCount: { color: colors.textMuted, fontSize: 12 },
});
