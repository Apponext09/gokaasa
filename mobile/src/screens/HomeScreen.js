import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
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
import { ActiveHoldCard } from '../components/ActiveHoldCard.js';
import { hotelsApi } from '../api/hotelsApi.js';
import { bookingsApi } from '../api/bookingsApi.js';
import { notificationsApi } from '../api/notificationsApi.js';
import { useAuth } from '../context/AuthContext.js';
import { useBookingSearch } from '../context/BookingSearchContext.js';
import { todayIso, addDaysIso, summarizeOccupancy, formatOccupancy } from '../utils/format.js';
import { validateSearchCriteria } from '../utils/searchValidation.js';
import { resolveDestinationImage } from '../utils/imageUrl.js';
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
  const {
    destination: contextDestination,
    setDestination: setContextDestination,
    checkIn,
    checkOut,
    setDates,
    rooms,
    setRooms,
  } = useBookingSearch();

  const [destinations, setDestinations] = useState({ status: 'loading', items: [] });
  const [handpicked, setHandpicked] = useState({ status: 'loading', items: [], total: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const [destination, setDestination] = useState(null);
  const [destinationText, setDestinationText] = useState('');
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [formError, setFormError] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [reservingHotelId, setReservingHotelId] = useState(null);

  const handleCheckInChange = (newIn) => {
    if (checkOut <= newIn) {
      setDates(newIn, addDaysIso(newIn, 1));
    } else {
      setDates(newIn, checkOut);
    }
  };

  const handleCheckOutChange = (newOut) => {
    setDates(checkIn, newOut);
  };

  const handleQuickReserve = async (hotel) => {
    if (!isAuthenticated) {
      navigation.navigate('Auth', { screen: 'Login' });
      return;
    }

    setReservingHotelId(hotel.id);
    try {
      let roomTypeId = hotel.bestOffer?.roomTypeId;
      let ratePlanId = hotel.bestOffer?.ratePlanId;
      let roomName = hotel.bestOffer?.roomName;
      let planName = hotel.bestOffer?.ratePlanName;

      // If bestOffer is not pre-computed (e.g. curated handpicked teaser), fetch real availability
      if (!roomTypeId || !ratePlanId) {
        const avail = await hotelsApi.availability(hotel.slug, {
          checkIn,
          checkOut,
          occ: formatOccupancy(rooms),
        });
        const firstAvailable = avail.roomTypes?.find((r) => r.available);
        const firstPlan = firstAvailable?.ratePlans?.[0];

        if (!firstAvailable || !firstPlan) {
          navigation.navigate('HotelDetails', { idOrSlug: hotel.slug, checkIn, checkOut, occupancy: rooms });
          return;
        }

        roomTypeId = firstAvailable.id;
        ratePlanId = firstPlan.ratePlanId;
        roomName = firstAvailable.name;
        planName = firstPlan.name;
      }

      const hold = await bookingsApi.createHold({
        hotelId: hotel.id,
        roomTypeId,
        ratePlanId,
        checkIn,
        checkOut,
        rooms: rooms.length,
        occupancy: rooms,
      });

      navigation.navigate('Booking', {
        holdId: hold.id,
        hotelName: hotel.name,
        roomName: roomName || 'Selected Room',
        planName: planName || 'Standard Rate',
        isQuickReserve: true,
      });
    } catch (err) {
      Alert.alert('Unable to reserve', err.message || 'Room could not be held. Please view hotel rooms.');
    } finally {
      setReservingHotelId(null);
    }
  };

  const loadUnreadCount = useCallback(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return Promise.resolve();
    }
    return notificationsApi.unreadCount().then(setUnreadCount).catch(() => { });
  }, [isAuthenticated]);

  const load = useCallback(async () => {
    hotelsApi
      .popularDestinations({ limit: 8 })
      .then((items) => setDestinations({ status: 'ready', items }))
      .catch(() => setDestinations({ status: 'error', items: [] }));
    hotelsApi
      .handpickedHotels({ limit: 100 })
      .then((res) => setHandpicked({ status: 'ready', items: res.items ?? [], total: res.pagination?.total ?? res.total ?? (res.items?.length ?? 0) }))
      .catch(() => setHandpicked({ status: 'error', items: [], total: 0 }));
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

  // Pass the currently selected dates and occupancy so HotelDetailsScreen starts with the same
  // values the user just configured.
  const openHotel = (hotel) => navigation.navigate('HotelDetails', { idOrSlug: hotel.slug, checkIn, checkOut, occupancy: rooms });

  const goToDestination = (item) => {
    setContextDestination(item);
    navigation.navigate('Search', { destination: item.destination, label: item.label, checkIn, checkOut, occupancy: rooms });
  };

  const onSearchPress = () => {
    const error = validateSearchCriteria(destination, checkIn, checkOut, { requireDestination: false });
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);
    if (destination) {
      setContextDestination(destination);
      navigation.navigate('Search', {
        destination: destination.destination,
        area: destination.area,
        label: destination.label,
        checkIn,
        checkOut,
        occupancy: rooms,
      });
    } else if (destinationText?.trim()) {
      navigation.navigate('Search', {
        label: destinationText.trim(),
        checkIn,
        checkOut,
        occupancy: rooms,
      });
    } else {
      navigation.navigate('Search', {
        checkIn,
        checkOut,
        occupancy: rooms,
      });
    }
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
              <Pressable
                style={styles.headerIcon}
                onPress={() => {
                  if (isAuthenticated) {
                    navigation.navigate('Main', { screen: 'Profile' });
                  } else {
                    navigation.navigate('Auth', { screen: 'Login' });
                  }
                }}
                accessibilityLabel="Profile"
              >
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

        <FadeSlideIn delay={80} style={styles.searchCard}>
          <DestinationInput
            text={destinationText}
            onChangeText={setDestinationText}
            selected={destination}
            onSelect={setDestination}
            onPickHotel={(item) =>
              navigation.navigate('HotelDetails', {
                idOrSlug: item.hotelSlug,
                checkIn,
                checkOut,
                occupancy: rooms,
              })
            }
          />

          <View style={styles.row}>
            <DateField
              label="Check-in"
              value={checkIn}
              minimumDate={todayIso()}
              onChange={handleCheckInChange}
            />
            <DateField
              label="Check-out"
              value={checkOut}
              minimumDate={addDaysIso(checkIn, 1)}
              onChange={handleCheckOutChange}
            />
          </View>

          <Pressable
            testID="home-guests-trigger"
            style={styles.guestsRow}
            onPress={() => setGuestsOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`ROOMS & GUESTS, ${summarizeOccupancy(rooms)}`}
          >
            <Ionicons name="people-outline" size={18} color={colors.brand600} />
            <View style={styles.guestsFieldTextWrap}>
              <Text style={styles.guestsFieldLabel}>ROOMS & GUESTS</Text>
              <Text style={styles.guestsText}>{summarizeOccupancy(rooms)}</Text>
            </View>
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

        {isAuthenticated && <ActiveHoldCard navigation={navigation} />}

        {destinations.items.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Popular destinations" />
            <FlatList
              data={destinations.items}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.destination}
              contentContainerStyle={{ gap: spacing.md }}
              renderItem={({ item }) => {
                const imgUri = resolveDestinationImage(item);
                return (
                  <Pressable
                    style={styles.destinationCard}
                    onPress={() => goToDestination(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.label}, ${item.hotelCount > 0 ? `Explore ${item.hotelCount} ${item.hotelCount === 1 ? 'hotel' : 'hotels'}` : 'Explore hotels'}`}
                  >
                    <ExpoImage
                      source={{ uri: imgUri }}
                      style={styles.destinationImage}
                      contentFit="cover"
                      transition={150}
                      placeholder={{ color: colors.brand800 }}
                    />
                    <View style={styles.destinationScrim} pointerEvents="none" />
                    <View style={styles.destinationCaption} pointerEvents="none">
                      <Text style={styles.destinationLabel} numberOfLines={1}>{item.label}</Text>
                      {item.hotelCount > 0 && (
                        <Text style={styles.destinationCount} numberOfLines={1}>
                          Explore {item.hotelCount} {item.hotelCount === 1 ? 'hotel' : 'hotels'}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              }}
            />
          </View>
        )}

        <View style={styles.section}>
          <SectionHeader title="Handpicked for you" actionLabel="See all" onAction={() => navigation.navigate('Search')} />
          {handpicked.status === 'ready' && (handpicked.total || handpicked.items.length) > 0 && (
            <Text style={styles.propertiesFound}>
              Hotels ({handpicked.total || handpicked.items.length} {(handpicked.total || handpicked.items.length) === 1 ? 'Property' : 'Properties'} Found)
            </Text>
          )}
          {handpicked.status === 'loading' && (
            <>
              <HotelCardSkeleton compact />
              <HotelCardSkeleton compact />
            </>
          )}
          {handpicked.status === 'ready' && handpicked.items.length === 0 && (
            <EmptyState icon="bed-outline" title="No hotels yet" message="Check back soon -- new stays are added regularly." />
          )}
          {handpicked.items.map((hotel, index) => (
            <FadeSlideIn key={hotel.id} delay={Math.min(index, 4) * 50}>
              <HotelCard
                hotel={hotel}
                compact
                onPress={() => openHotel(hotel)}
                onQuickReserve={() => handleQuickReserve(hotel)}
                isQuickReserving={reservingHotelId === hotel.id}
              />
            </FadeSlideIn>
          ))}
        </View>
      </ScrollView>

      <GuestsModal visible={guestsOpen} rooms={rooms} onChange={setRooms} onClose={() => setGuestsOpen(false)} />
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
  searchCard: {
    marginHorizontal: spacing.lg,
    marginTop: -40,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  guestsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceCard,
  },
  guestsFieldTextWrap: { flex: 1, justifyContent: 'center' },
  guestsFieldLabel: { ...typography.tiny, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  guestsText: { ...typography.bodyStrong, color: colors.textStrong },
  flex1End: { marginLeft: 'auto' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  errorText: { ...typography.caption, color: colors.danger600, flexShrink: 1 },
  searchButton: { height: 52 },
  section: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  propertiesFound: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: -spacing.xs,
    marginBottom: spacing.md,
  },
  destinationCard: {
    width: 148,
    height: 148,
    borderRadius: radius.card,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.brand800,
    ...shadow.card,
  },
  destinationImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 148,
    height: 148,
  },
  destinationScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 148,
    height: 148,
    backgroundColor: 'rgba(10, 23, 38, 0.40)',
  },
  destinationCaption: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    gap: 2,
  },
  destinationLabel: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
    lineHeight: 18,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  destinationCount: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
