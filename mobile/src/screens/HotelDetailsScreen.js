import { useEffect, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { LoadingView } from '../components/LoadingView.js';
import { ErrorView } from '../components/ErrorView.js';
import { AppButton } from '../components/AppButton.js';
import { StarRating } from '../components/StarRating.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { hotelsApi } from '../api/hotelsApi.js';
import { useAuth } from '../context/AuthContext.js';
import { useWishlist } from '../context/WishlistContext.js';
import { PROPERTY_TYPE_LABEL } from '../constants/booking.js';
import { todayIso, addDaysIso } from '../utils/format.js';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

export default function HotelDetailsScreen({ route, navigation }) {
  const { idOrSlug, checkIn, checkOut, occupancy } = route.params;
  const { isAuthenticated } = useAuth();
  const { isWishlisted, toggle } = useWishlist();
  const [state, setState] = useState({ status: 'loading', hotel: null, error: null });
  const { width } = useWindowDimensions();
  const [activeImage, setActiveImage] = useState(0);
  const galleryRef = useRef(null);

  useEffect(() => {
    hotelsApi
      .hotel(idOrSlug)
      .then((hotel) => setState({ status: 'ready', hotel, error: null }))
      .catch((err) => setState({ status: 'error', hotel: null, error: err.message }));
  }, [idOrSlug]);

  if (state.status === 'loading') return <LoadingView label="Loading hotel…" />;
  if (state.status === 'error') return <ErrorView message={state.error} onRetry={() => navigation.replace('HotelDetails', route.params)} />;

  const hotel = state.hotel;
  const address = [hotel.addressLine, hotel.area, hotel.city, hotel.state].filter(Boolean).join(', ');
  const wishlisted = isAuthenticated ? isWishlisted(hotel.id) : Boolean(hotel.isWishlisted);
  const ratingValue = hotel.guestRating ?? hotel.rating?.average ?? null;
  const ratingCount = hotel.guestRating != null ? hotel.reviewCount : hotel.rating?.count;
  const images = hotel.images?.length ? hotel.images : [null];

  const goToRooms = () => {
    navigation.navigate('RoomSelection', {
      hotelId: hotel.id,
      hotelSlug: hotel.slug,
      hotelName: hotel.name,
      checkIn: checkIn ?? addDaysIso(todayIso(), 1),
      checkOut: checkOut ?? addDaysIso(todayIso(), 2),
      occupancy: occupancy ?? [{ adults: 2, childAges: [] }],
    });
  };

  return (
    <ScreenContainer edges={['bottom']}>
      <ScrollView>
        <View>
          <FlatList
            ref={galleryRef}
            data={images}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item, i) => item?.id ?? `placeholder-${i}`}
            onMomentumScrollEnd={(e) => setActiveImage(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => (
              <Image
                source={item?.url ? { uri: item.url } : undefined}
                style={[styles.galleryImage, { width }]}
                contentFit="cover"
                placeholder={{ color: colors.surfaceMuted }}
              />
            )}
          />
          {images.length > 1 && (
            <View style={styles.dotsRow} pointerEvents="none">
              {images.map((_, i) => (
                <View key={i} style={[styles.dot, i === activeImage && styles.dotActive]} />
              ))}
            </View>
          )}
          {images.length > 1 && (
            <View style={styles.countChip} pointerEvents="none">
              <Ionicons name="images-outline" size={12} color={colors.white} />
              <Text style={styles.countChipText}>{activeImage + 1}/{images.length}</Text>
            </View>
          )}
        </View>

        <FadeSlideIn style={styles.body}>
          <View style={styles.titleRow}>
            <View style={styles.flex1}>
              {hotel.starRating ? <StarRating count={hotel.starRating} /> : (
                <Text style={styles.propertyType}>{PROPERTY_TYPE_LABEL[hotel.propertyType] ?? 'Stay'}</Text>
              )}
              <Text style={styles.name}>{hotel.name}</Text>
              <View style={styles.addressRow}>
                <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                <Text style={styles.address}>{address}</Text>
              </View>
            </View>
            {isAuthenticated && (
              <AppButton
                title=""
                icon={<Ionicons name={wishlisted ? 'heart' : 'heart-outline'} size={18} color={wishlisted ? colors.white : colors.brand600} />}
                variant={wishlisted ? 'primary' : 'secondary'}
                size="sm"
                onPress={() => toggle(hotel.id)}
                style={styles.wishlistButton}
              />
            )}
          </View>

          {ratingValue != null && (
            <View style={styles.ratingRow}>
              <View style={styles.ratingChip}>
                <Text style={styles.ratingChipText}>{ratingValue.toFixed(1)}</Text>
              </View>
              {ratingCount > 0 && <Text style={styles.caption}>{ratingCount.toLocaleString('en-IN')} reviews</Text>}
            </View>
          )}

          {hotel.description ? (
            <Text style={styles.description}>{hotel.description}</Text>
          ) : (
            <Text style={styles.captionMuted}>The hotel has not added a description yet.</Text>
          )}

          {(hotel.checkInTime || hotel.checkOutTime) && (
            <View style={styles.timesRow}>
              {hotel.checkInTime && <Text style={styles.caption}>Check-in from {hotel.checkInTime.slice(0, 5)}</Text>}
              {hotel.checkOutTime && <Text style={styles.caption}>Check-out before {hotel.checkOutTime.slice(0, 5)}</Text>}
            </View>
          )}

          {hotel.amenities?.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Amenities</Text>
              <View style={styles.amenityGrid}>
                {hotel.amenities.map((a) => (
                  <View key={a.code} style={styles.amenityItem}>
                    <Ionicons name="checkmark-circle" size={15} color={colors.success600} />
                    <Text style={styles.amenityText}>{a.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {hotel.cancellationPolicies?.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Cancellation policies</Text>
              {hotel.cancellationPolicies.map((p) => (
                // Verified live against production: a policy here is { code, name, summary } -- there is
                // no `id` field (that only exists on a HOLD's own resolved cancellationPolicy, a
                // different shape from RoomSelection/BookingScreen). `code` is the real, stable,
                // unique-per-type identifier; `p.id` was always undefined, which is exactly why React
                // reported a missing key here. `p.description` was also wrong -- the real field is
                // `summary` (it was silently rendering "undefined" before).
                <Text key={p.code} style={styles.caption}>• {p.summary}</Text>
              ))}
            </View>
          )}
        </FadeSlideIn>
      </ScrollView>

      <View style={styles.footer}>
        <AppButton title="See available rooms" onPress={goToRooms} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  galleryImage: { height: 260, backgroundColor: colors.surfaceMuted },
  dotsRow: { position: 'absolute', bottom: spacing.md, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotActive: { backgroundColor: colors.white, width: 8, height: 8, borderRadius: 4 },
  countChip: {
    position: 'absolute', top: spacing.md, right: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.scrim, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  countChipText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  body: { padding: spacing.lg, gap: spacing.sm },
  flex1: { flex: 1 },
  titleRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  propertyType: { ...typography.tiny, color: colors.textMuted },
  name: { ...typography.display, color: colors.textStrong },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  address: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  // 44dp is the minimum comfortable touch target; the "sm" AppButton size this otherwise uses is only
  // 36dp tall, below that floor for what is a real, frequently-tapped control on this screen.
  wishlistButton: { width: 44, height: 44, paddingHorizontal: 0 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ratingChip: { backgroundColor: colors.brand600, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  ratingChipText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  caption: { ...typography.caption, color: colors.textMuted },
  captionMuted: { ...typography.caption, color: colors.textMuted, fontStyle: 'italic' },
  description: { ...typography.body, color: colors.textBody },
  timesRow: { flexDirection: 'row', gap: spacing.lg },
  section: { marginTop: spacing.md, gap: spacing.xs, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  sectionTitle: { ...typography.h2, color: colors.textStrong, marginBottom: spacing.xs },
  amenityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  amenityItem: { flexDirection: 'row', alignItems: 'center', gap: 4, width: '45%' },
  amenityText: { ...typography.caption, color: colors.textBody },
  // Deliberately NOT flexDirection: 'row' (it has exactly one child, the button, so a row never bought
  // anything). AppButton.js wraps its Pressable in an unstyled <Animated.View> for its press-scale
  // animation, which defaults to flexDirection: 'column' and has no size of its own. A `flex: 1` passed
  // in via AppButton's `style` prop lands on the Pressable, one level INSIDE that wrapper -- inside a row
  // footer, that `flex: 1` was being read relative to the column-direction Animated.View, not the row, so
  // it governed height (collapsing to ~23px, flex-basis: 0%) instead of width (collapsing to the label's
  // own ~185px), instead of filling the footer -- this was the actual bug (confirmed by inspecting the
  // real computed layout; a static reading of the styles alone did not explain it). With footer back to
  // its block-level default (column), AppButton's own Animated.View stretches to the footer's full width
  // the same, unforced way every other full-width AppButton in this app already relies on (e.g.
  // HomeScreen's "Search Hotels") -- no `style` override is needed here, or safe to add back as `flex: 1`.
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.borderSubtle, backgroundColor: colors.surfaceCard, ...shadow.floating },
});
