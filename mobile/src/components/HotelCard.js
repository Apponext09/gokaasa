import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';
import { formatMoneyMinor } from '../utils/format.js';
import { PROPERTY_TYPE_LABEL, MEAL_PLAN_LABEL } from '../constants/booking.js';
import { StarRating } from './StarRating.js';
import { StatusBadge } from './StatusBadge.js';
import { Shimmer } from './Shimmer.js';
import { useAuth } from '../context/AuthContext.js';
import { useWishlist } from '../context/WishlistContext.js';

/**
 * Derives the strikethrough-price/discount-badge values from a search card's own `bestOffer`, which
 * already carries baseTotalMinor/discountTotalMinor/nights -- mirrors the website's discountDisplay.js
 * exactly, never inventing a discount the backend didn't compute. `nights` can be 0 on cards built with
 * no real stay context (e.g. the wishlist's toHotelCard call), so the per-night figure is guarded.
 */
function discountFromOffer(offer) {
  if (!offer?.discountTotalMinor || offer.discountTotalMinor <= 0) return { discountPercent: null, originalPerNightMinor: null };
  return {
    discountPercent: Math.round((offer.discountTotalMinor / offer.baseTotalMinor) * 100),
    originalPerNightMinor: offer.nights > 0 ? Math.round(offer.baseTotalMinor / offer.nights) : null,
  };
}

/** Dedupes (a hotel can carry the same amenity twice from more than one provider), then caps the shown
 * list and reports how many more there are -- never a silently-truncated or repeated list. */
function normalizeAmenities(amenities = [], max = 3) {
  const unique = [...new Set(amenities)];
  return { shown: unique.slice(0, max), moreCount: Math.max(0, unique.length - max) };
}

/**
 * One hotel in a results/home list. Every value shown comes straight from the real search response
 * (backend/src/controllers/search.controller.js) -- nothing here is estimated or invented, matching the
 * website's own HotelCard.jsx field-for-field.
 */
export function HotelCard({ hotel, onPress }) {
  const { isAuthenticated } = useAuth();
  const { isWishlisted, toggle } = useWishlist();
  const scale = useRef(new Animated.Value(1)).current;
  const offer = hotel.bestOffer;
  // Search/availability results carry a full `bestOffer` (meal plan, nights, free cancellation). Teaser
  // lists with no stay context (handpickedHotels/nearbyHotels) carry only `price.amountMinor` instead --
  // verified live against production (search.controller.js's handpicked/nearby responses never include
  // bestOffer at all, not even null). Shown as a simpler "from ₹X / night" line when that's all there is.
  const simplePrice = !offer ? hotel.price : null;
  // The admin coupon/offer system's best generally-available discount, server-computed against this
  // exact price (hotelSearch.service.js#offerBadgeFor) -- present alongside either price shape above.
  const couponOffer = hotel.offer;
  const { shown: amenities, moreCount: moreAmenityCount } = normalizeAmenities(hotel.amenities, 3);
  const place = [hotel.area, hotel.city, hotel.country].filter(Boolean).join(', ');
  const wishlisted = isAuthenticated ? isWishlisted(hotel.id) : Boolean(hotel.wishlisted ?? hotel.isWishlisted);
  const ratingValue = hotel.guestRating ?? hotel.rating?.average ?? null;
  const ratingCount = hotel.guestRating != null ? hotel.reviewCount : hotel.rating?.count;
  const { discountPercent, originalPerNightMinor } = offer ? discountFromOffer(offer) : { discountPercent: null, originalPerNightMinor: null };

  const animateTo = (value) => Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 0 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable onPress={onPress} onPressIn={() => animateTo(0.98)} onPressOut={() => animateTo(1)} style={[styles.card, shadow.card]}>
        <View style={styles.imageWrap}>
          <Image
            source={hotel.image?.url ? { uri: hotel.image.url } : undefined}
            style={styles.image}
            contentFit="cover"
            transition={150}
            placeholder={{ color: colors.surfaceMuted }}
          />
          {(discountPercent > 0 || simplePrice?.discountPercent > 0) && (
            <View style={styles.discountBadge}>
              <StatusBadge label={`${discountPercent || simplePrice.discountPercent}% OFF`} tone="premium" />
            </View>
          )}
          {isAuthenticated && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                toggle(hotel.id);
              }}
              style={styles.wishlistButton}
              accessibilityRole="button"
              accessibilityLabel={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
            >
              <Ionicons name={wishlisted ? 'heart' : 'heart-outline'} size={18} color={wishlisted ? colors.danger600 : colors.textStrong} />
            </Pressable>
          )}
          {hotel.image?.isIllustrative && (
            <View style={styles.illustrativeStrip}>
              <Text style={styles.illustrativeText}>Image for illustration</Text>
            </View>
          )}
        </View>

        <View style={styles.body}>
          {hotel.starRating ? <StarRating count={hotel.starRating} /> : (
            <Text style={styles.propertyType}>{PROPERTY_TYPE_LABEL[hotel.propertyType] ?? 'Stay'}</Text>
          )}
          <Text style={styles.name} numberOfLines={1}>{hotel.name}</Text>
          <View style={styles.row}>
            <Ionicons name="location-outline" size={13} color={colors.textMuted} />
            <Text style={styles.place} numberOfLines={1}>{place}</Text>
          </View>

          {ratingValue != null ? (
            <View style={styles.row}>
              <View style={styles.ratingChip}>
                <Text style={styles.ratingChipText}>{ratingValue.toFixed(1)}</Text>
              </View>
              {ratingCount > 0 && <Text style={styles.caption}>{ratingCount.toLocaleString('en-IN')} reviews</Text>}
            </View>
          ) : (
            <StatusBadge label="New" tone="neutral" />
          )}

          {amenities.length > 0 && (
            <View style={styles.amenitiesRow}>
              {amenities.map((name) => (
                <View key={name} style={styles.amenityItem}>
                  <Ionicons name="checkmark" size={12} color={colors.success600} />
                  <Text style={styles.caption} numberOfLines={1}>{name}</Text>
                </View>
              ))}
              {moreAmenityCount > 0 && <Text style={styles.caption}>+{moreAmenityCount} more</Text>}
            </View>
          )}

          {offer && (
            <View style={styles.offerBlock}>
              <View style={styles.badgeRow}>
                <StatusBadge label={MEAL_PLAN_LABEL[offer.mealPlan] ?? 'Room only'} tone="brand" />
                {offer.freeCancellation ? (
                  <StatusBadge label="Free cancellation" tone="success" />
                ) : offer.refundable ? (
                  <StatusBadge label="Partly refundable" tone="neutral" />
                ) : (
                  <StatusBadge label="Non-refundable" tone="danger" />
                )}
                {offer.roomsLeft > 0 && offer.roomsLeft <= 3 && <StatusBadge label={`Only ${offer.roomsLeft} left`} tone="warning" />}
                {couponOffer && <StatusBadge label={`${couponOffer.discountPercent}% OFF with code ${couponOffer.code}`} tone="premium" />}
              </View>
              <View style={styles.priceFooter}>
                <View>
                  <View style={styles.priceRow}>
                    {originalPerNightMinor > 0 && <Text style={styles.strikethrough}>{formatMoneyMinor(originalPerNightMinor)}</Text>}
                    <Text style={styles.price}>{formatMoneyMinor(offer.pricePerNightMinor)}</Text>
                    <Text style={styles.perNight}>/ night</Text>
                  </View>
                  <Text style={styles.caption}>
                    {offer.nights} night{offer.nights === 1 ? '' : 's'} · {formatMoneyMinor(offer.finalTotalMinor)} total
                  </Text>
                </View>
                <View style={styles.viewDetails}>
                  <Text style={styles.viewDetailsText}>View</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.brand600} />
                </View>
              </View>
            </View>
          )}

          {simplePrice?.amountMinor != null && (
            <View style={styles.offerBlock}>
              {couponOffer && (
                <View style={styles.badgeRow}>
                  <StatusBadge label={`${couponOffer.discountPercent}% OFF with code ${couponOffer.code}`} tone="premium" />
                </View>
              )}
              <View style={styles.priceFooter}>
                <View style={styles.priceRow}>
                  {simplePrice.originalAmountMinor > simplePrice.amountMinor && (
                    <Text style={styles.strikethrough}>{formatMoneyMinor(simplePrice.originalAmountMinor)}</Text>
                  )}
                  <Text style={styles.price}>{formatMoneyMinor(simplePrice.amountMinor)}</Text>
                  <Text style={styles.perNight}>/ night</Text>
                </View>
                <View style={styles.viewDetails}>
                  <Text style={styles.viewDetailsText}>View</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.brand600} />
                </View>
              </View>
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function HotelCardSkeleton() {
  return (
    <View style={[styles.card, shadow.card]}>
      <Shimmer style={[styles.imageWrap, styles.skeletonBlock]} />
      <View style={styles.body}>
        <Shimmer style={[styles.skeletonLine, { width: '40%' }]} />
        <Shimmer style={[styles.skeletonLine, { width: '70%', height: 16 }]} />
        <Shimmer style={[styles.skeletonLine, { width: '55%' }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surfaceCard, borderRadius: radius.card, overflow: 'hidden', marginBottom: spacing.lg },
  imageWrap: { width: '100%', height: 180, backgroundColor: colors.surfaceMuted },
  image: { width: '100%', height: '100%' },
  wishlistButton: {
    position: 'absolute', top: spacing.sm, right: spacing.sm, width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center',
  },
  discountBadge: { position: 'absolute', top: spacing.sm, left: spacing.sm },
  illustrativeStrip: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim, paddingVertical: 4 },
  illustrativeText: { ...typography.tiny, color: colors.white, textAlign: 'center' },
  body: { padding: spacing.lg, gap: 4 },
  propertyType: { ...typography.tiny, color: colors.textMuted },
  name: { ...typography.h2, color: colors.textStrong },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  place: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  caption: { ...typography.caption, color: colors.textMuted },
  ratingChip: { backgroundColor: colors.brand600, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  ratingChipText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  amenitiesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 2 },
  amenityItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  offerBlock: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle, gap: spacing.sm },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  priceFooter: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 },
  price: { fontSize: 19, fontWeight: '700', color: colors.textStrong },
  strikethrough: { ...typography.caption, color: colors.textMuted, textDecorationLine: 'line-through' },
  perNight: { ...typography.caption, color: colors.textMuted },
  viewDetails: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewDetailsText: { ...typography.captionStrong, color: colors.brand600 },
  skeletonBlock: { backgroundColor: colors.surfaceMuted },
  skeletonLine: { height: 12, borderRadius: 6, backgroundColor: colors.surfaceMuted, marginVertical: 3 },
});
