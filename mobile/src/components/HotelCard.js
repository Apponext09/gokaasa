import { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { resolveImageUrl } from '../utils/imageUrl.js';

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
export function HotelCard({ hotel, onPress, onQuickReserve, isQuickReserving, compact = false, variant }) {
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
      <Pressable onPress={onPress} onPressIn={() => animateTo(0.98)} onPressOut={() => animateTo(1)} style={[styles.card, compact && styles.cardCompact, shadow.card]}>
        <View style={[styles.imageWrap, compact && styles.imageWrapCompact]}>
          <Image
            source={resolveImageUrl(hotel.image?.url) ? { uri: resolveImageUrl(hotel.image?.url) } : undefined}
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

        <View style={[styles.body, compact && styles.bodyCompact]}>
          {hotel.starRating ? <StarRating count={hotel.starRating} /> : (
            <Text style={styles.propertyType}>{hotel.propertyTypeName ?? PROPERTY_TYPE_LABEL[hotel.propertyType] ?? hotel.propertyType?.replaceAll('_', ' ') ?? 'Stay'}</Text>
          )}
          <Text style={[styles.name, compact && styles.nameCompact]} numberOfLines={1}>{hotel.name}</Text>
          <View style={styles.row}>
            <Ionicons name="location-outline" size={13} color={colors.textMuted} />
            <Text style={styles.place} numberOfLines={1}>{place}</Text>
          </View>

          {ratingValue != null ? (
            <View style={styles.row}>
              <View style={[styles.ratingChip, compact && styles.ratingChipCompact]}>
                <Text style={[styles.ratingChipText, compact && styles.ratingChipTextCompact]}>{ratingValue.toFixed(1)}</Text>
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

          {variant === 'similar' ? (
            <View style={[styles.offerBlock, compact && styles.offerBlockCompact]}>
              <View style={[styles.priceFooter, { justifyContent: 'flex-end' }]}>
                <Pressable
                  style={({ pressed }) => [styles.viewDetails, pressed && styles.btnPressed]}
                  onPress={onPress}
                  accessibilityRole="button"
                  accessibilityLabel={`View details for ${hotel.name}`}
                >
                  <Text style={styles.viewDetailsText}>View</Text>
                  <Ionicons name="chevron-forward" size={13} color={colors.brand600} />
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              {offer && (
                <View style={[styles.offerBlock, compact && styles.offerBlockCompact]}>
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
                    <View style={styles.priceCol}>
                      <View style={styles.priceRow}>
                        {originalPerNightMinor > 0 && <Text style={styles.strikethrough}>{formatMoneyMinor(originalPerNightMinor)}</Text>}
                        <Text style={[styles.price, compact && styles.priceCompact]}>{formatMoneyMinor(offer.pricePerNightMinor)}</Text>
                        <Text style={styles.perNight}>/ night</Text>
                      </View>
                      <Text style={styles.caption}>
                        {offer.nights} night{offer.nights === 1 ? '' : 's'} · {formatMoneyMinor(offer.finalTotalMinor)} total
                      </Text>
                    </View>

                    <View style={styles.actionsRow}>
                      {onQuickReserve && offer?.roomTypeId ? (
                        <Pressable
                          style={({ pressed }) => [styles.quickReserveBtn, pressed && styles.btnPressed]}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            onQuickReserve(hotel);
                          }}
                          disabled={isQuickReserving}
                          accessibilityRole="button"
                          accessibilityLabel={`Quick reserve ${hotel.name}`}
                        >
                          {isQuickReserving ? (
                            <ActivityIndicator size="small" color={colors.white} />
                          ) : (
                            <>
                              <Ionicons name="flash" size={11} color={colors.white} />
                              <Text style={styles.quickReserveText}>Quick Reserve</Text>
                            </>
                          )}
                        </Pressable>
                      ) : null}

                      <Pressable
                        style={({ pressed }) => [styles.viewDetails, pressed && styles.btnPressed]}
                        onPress={onPress}
                        accessibilityRole="button"
                        accessibilityLabel={`View details for ${hotel.name}`}
                      >
                        <Text style={styles.viewDetailsText}>View</Text>
                        <Ionicons name="chevron-forward" size={13} color={colors.brand600} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              )}

              {!offer && simplePrice?.amountMinor != null && (
                <View style={[styles.offerBlock, compact && styles.offerBlockCompact]}>
                  {couponOffer && (
                    <View style={styles.badgeRow}>
                      <StatusBadge label={`${couponOffer.discountPercent}% OFF with code ${couponOffer.code}`} tone="premium" />
                    </View>
                  )}
                  <View style={styles.priceFooter}>
                    <View style={styles.priceCol}>
                      <View style={styles.priceRow}>
                        {simplePrice.originalAmountMinor > simplePrice.amountMinor && (
                          <Text style={styles.strikethrough}>{formatMoneyMinor(simplePrice.originalAmountMinor)}</Text>
                        )}
                        <Text style={[styles.price, compact && styles.priceCompact]}>{formatMoneyMinor(simplePrice.amountMinor)}</Text>
                        <Text style={styles.perNight}>/ night</Text>
                      </View>
                    </View>

                    <View style={styles.actionsRow}>
                      {onQuickReserve ? (
                        <Pressable
                          style={({ pressed }) => [styles.quickReserveBtn, pressed && styles.btnPressed]}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            onQuickReserve(hotel);
                          }}
                          disabled={isQuickReserving}
                          accessibilityRole="button"
                          accessibilityLabel={`Quick reserve ${hotel.name}`}
                        >
                          {isQuickReserving ? (
                            <ActivityIndicator size="small" color={colors.white} />
                          ) : (
                            <>
                              <Ionicons name="flash" size={11} color={colors.white} />
                              <Text style={styles.quickReserveText}>Quick Reserve</Text>
                            </>
                          )}
                        </Pressable>
                      ) : null}

                      <Pressable
                        style={({ pressed }) => [styles.viewDetails, pressed && styles.btnPressed]}
                        onPress={onPress}
                        accessibilityRole="button"
                        accessibilityLabel={`View details for ${hotel.name}`}
                      >
                        <Text style={styles.viewDetailsText}>View</Text>
                        <Ionicons name="chevron-forward" size={13} color={colors.brand600} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              )}

              {!offer && simplePrice?.amountMinor == null && (
                <View style={[styles.offerBlock, compact && styles.offerBlockCompact]}>
                  <View style={styles.badgeRow}>
                    <StatusBadge
                      label={hotel.availabilityStatus === 'HELD' ? 'Temporarily held' : 'Sold out'}
                      tone={hotel.availabilityStatus === 'HELD' ? 'warning' : 'neutral'}
                    />
                  </View>
                  <View style={styles.priceFooter}>
                    <View style={styles.priceCol}>
                      <Text style={styles.unavailableText}>Currently unavailable</Text>
                    </View>

                    <View style={styles.actionsRow}>
                      <Pressable
                        style={({ pressed }) => [styles.viewDetails, pressed && styles.btnPressed]}
                        onPress={onPress}
                        accessibilityRole="button"
                        accessibilityLabel={`View details for ${hotel.name}`}
                      >
                        <Text style={styles.viewDetailsText}>View</Text>
                        <Ionicons name="chevron-forward" size={13} color={colors.brand600} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function HotelCardSkeleton({ compact = false }) {
  return (
    <View style={[styles.card, compact && styles.cardCompact, shadow.card]}>
      <Shimmer style={[styles.imageWrap, compact && styles.imageWrapCompact, styles.skeletonBlock]} />
      <View style={[styles.body, compact && styles.bodyCompact]}>
        <Shimmer style={[styles.skeletonLine, { width: '40%' }]} />
        <Shimmer style={[styles.skeletonLine, { width: '70%', height: 16 }]} />
        <Shimmer style={[styles.skeletonLine, { width: '55%' }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surfaceCard, borderRadius: radius.card, overflow: 'hidden', marginBottom: spacing.lg },
  cardCompact: { marginBottom: spacing.md },
  imageWrap: { width: '100%', height: 180, backgroundColor: colors.surfaceMuted },
  imageWrapCompact: { height: 152 },
  image: { width: '100%', height: '100%' },
  wishlistButton: {
    position: 'absolute', top: spacing.sm, right: spacing.sm, width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center',
  },
  discountBadge: { position: 'absolute', top: spacing.sm, left: spacing.sm },
  illustrativeStrip: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim, paddingVertical: 4 },
  illustrativeText: { ...typography.tiny, color: colors.white, textAlign: 'center' },
  body: { padding: spacing.lg, gap: 4 },
  bodyCompact: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: 3 },
  propertyType: { ...typography.tiny, color: colors.textMuted },
  name: { ...typography.h2, color: colors.textStrong },
  nameCompact: { fontSize: 16, lineHeight: 21 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  place: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  caption: { ...typography.caption, color: colors.textMuted },
  ratingChip: { backgroundColor: colors.brand600, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  ratingChipCompact: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 },
  ratingChipText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  ratingChipTextCompact: { fontSize: 11 },
  amenitiesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 2 },
  amenityItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  offerBlock: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle, gap: spacing.sm },
  offerBlockCompact: { marginTop: spacing.xs, paddingTop: spacing.xs, gap: spacing.xs },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  priceFooter: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm },
  priceCol: { flex: 1, minWidth: 0 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 },
  price: { fontSize: 19, fontWeight: '700', color: colors.textStrong },
  priceCompact: { fontSize: 16.5 },
  strikethrough: { ...typography.caption, color: colors.textMuted, textDecorationLine: 'line-through' },
  perNight: { ...typography.caption, color: colors.textMuted },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  quickReserveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand600,
    borderRadius: 0,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  quickReserveText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.white,
  },
  btnPressed: { opacity: 0.8 },
  viewDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: colors.brand600,
    borderRadius: 0,
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    backgroundColor: 'transparent',
  },
  viewDetailsText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.brand600,
  },
  unavailableText: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  skeletonBlock: { backgroundColor: colors.surfaceMuted },
  skeletonLine: { height: 12, borderRadius: 6, backgroundColor: colors.surfaceMuted, marginVertical: 3 },
});
