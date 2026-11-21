import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { reviewsApi } from '../api/reviewsApi.js';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

function ratingLabel(value) {
  if (value >= 4.5) return 'Exceptional';
  if (value >= 4.0) return 'Very good';
  if (value >= 3.0) return 'Good';
  if (value >= 2.0) return 'Fair';
  return 'Needs improvement';
}

function reviewerInitials(name) {
  return String(name ?? 'Guest')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'G';
}

function formatReviewDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function Stars({ value, size = 14 }) {
  const rounded = Math.round(Number(value) || 0);
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Ionicons
          key={star}
          name={star <= rounded ? 'star' : 'star-outline'}
          size={size}
          color={star <= rounded ? colors.accent500 : colors.borderSubtle}
        />
      ))}
    </View>
  );
}

/**
 * Guest reviews section for HotelDetailsScreen.
 * Displays aggregate rating, 1-5 star breakdown, verified guest reviews, and pagination.
 */
export function HotelReviewsSection({ hotelIdOrSlug, initialRating }) {
  const [data, setData] = useState(null);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    reviewsApi
      .hotelReviews(hotelIdOrSlug, { page: 1, limit: 5, sort: 'newest' })
      .then((res) => {
        if (!active) return;
        setData(res);
        setItems(res.items || []);
        setPage(1);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Could not load reviews.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [hotelIdOrSlug]);

  const loadMore = () => {
    if (loadingMore || !data?.pagination || page >= data.pagination.totalPages) return;
    setLoadingMore(true);
    const nextPage = page + 1;

    reviewsApi
      .hotelReviews(hotelIdOrSlug, { page: nextPage, limit: 5, sort: 'newest' })
      .then((res) => {
        setData(res);
        setItems((prev) => [...prev, ...(res.items || [])]);
        setPage(nextPage);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  const rating = data?.rating || initialRating;
  const totalCount = rating?.count ?? 0;
  const avgRating = Number(rating?.average ?? 0);
  const totalPages = data?.pagination?.totalPages ?? 1;

  return (
    <View style={styles.container}>
      {/* ── Section Header ── */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleWrap}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.brand600} />
          <Text style={styles.title}>Guest reviews</Text>
        </View>
        {totalCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{totalCount} {totalCount === 1 ? 'review' : 'reviews'}</Text>
          </View>
        )}
      </View>

      {/* ── Loading Skeleton ── */}
      {loading && (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="small" color={colors.brand600} />
          <Text style={styles.loadingText}>Loading guest reviews…</Text>
        </View>
      )}

      {/* ── Error State ── */}
      {!loading && error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* ── Empty State ── */}
      {!loading && !error && totalCount === 0 && (
        <View style={styles.emptyBox}>
          <Ionicons name="chatbox-outline" size={32} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No guest reviews yet</Text>
          <Text style={styles.emptySubtitle}>Be the first guest to share your stay experience.</Text>
        </View>
      )}

      {/* ── Content: Summary & Reviews List ── */}
      {!loading && !error && totalCount > 0 && (
        <>
          {/* Summary Card */}
          <View style={[styles.summaryCard, shadow.card]}>
            <View style={styles.summaryTop}>
              <View>
                <View style={styles.scoreRow}>
                  <Text style={styles.scoreNumber}>{avgRating.toFixed(1)}</Text>
                  <Text style={styles.scoreMax}> / 5</Text>
                </View>
                <View style={styles.labelRow}>
                  <Stars value={avgRating} size={15} />
                  <Text style={styles.labelText}>{ratingLabel(avgRating)}</Text>
                </View>
              </View>
            </View>

            {/* Rating distribution progress bars */}
            <View style={styles.distributionBox}>
              {[5, 4, 3, 2, 1].map((star) => {
                const count = rating?.distribution?.[star] ?? 0;
                const percentage = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
                return (
                  <View key={star} style={styles.distRow}>
                    <Text style={styles.distStarLabel}>{star} ★</Text>
                    <View style={styles.distTrack}>
                      <View style={[styles.distFill, { width: `${percentage}%` }]} />
                    </View>
                    <Text style={styles.distCount}>{count}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Reviews list */}
          <View style={styles.list}>
            {items.map((review) => (
              <View key={review.id} style={[styles.reviewCard, shadow.card]}>
                {/* Author row */}
                <View style={styles.authorRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{reviewerInitials(review.reviewerName)}</Text>
                  </View>
                  <View style={styles.authorInfo}>
                    <Text style={styles.authorName} numberOfLines={1}>
                      {review.reviewerName || 'Gokaasa guest'}
                    </Text>
                    <Text style={styles.reviewDate}>{formatReviewDate(review.createdAt)}</Text>
                  </View>
                  {review.verifiedStay && (
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="checkmark-circle" size={13} color={colors.success600} />
                      <Text style={styles.verifiedText}>Verified stay</Text>
                    </View>
                  )}
                </View>

                {/* Rating stars */}
                <View style={styles.reviewRatingRow}>
                  <Stars value={review.rating} size={13} />
                  <Text style={styles.reviewRatingNum}>{Number(review.rating).toFixed(1)}</Text>
                </View>

                {/* Title and Body */}
                {review.title ? <Text style={styles.reviewTitle}>{review.title}</Text> : null}
                {review.body ? <Text style={styles.reviewBody}>{review.body}</Text> : null}
              </View>
            ))}
          </View>

          {/* Load More Button */}
          {page < totalPages && (
            <Pressable
              style={({ pressed }) => [styles.loadMoreBtn, pressed && styles.pressed]}
              onPress={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={colors.brand600} />
              ) : (
                <Text style={styles.loadMoreText}>View more reviews</Text>
              )}
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textStrong,
    lineHeight: 20,
  },
  badge: {
    backgroundColor: colors.brand50,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.brand600,
  },
  centerLoading: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  loadingText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  errorBox: {
    padding: spacing.sm,
    borderRadius: radius.control,
    backgroundColor: colors.danger50,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger600,
  },
  emptyBox: {
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    gap: 3,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textStrong,
  },
  emptySubtitle: {
    ...typography.tiny,
    color: colors.textMuted,
    textAlign: 'center',
  },

  /* ── Summary Card ── */
  summaryCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.card,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textStrong,
    lineHeight: 28,
  },
  scoreMax: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  labelText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.brand600,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },

  /* ── Distribution ── */
  distributionBox: {
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.xs,
  },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  distStarLabel: {
    width: 24,
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    lineHeight: 14,
  },
  distTrack: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  distFill: {
    height: '100%',
    backgroundColor: colors.accent500,
    borderRadius: radius.pill,
  },
  distCount: {
    width: 20,
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'right',
    lineHeight: 14,
  },

  /* ── Reviews list ── */
  list: {
    gap: spacing.sm,
  },
  reviewCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.card,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: 3,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.brand700,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  authorInfo: {
    flex: 1,
    minWidth: 0,
  },
  authorName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textStrong,
    lineHeight: 16,
  },
  reviewDate: {
    fontSize: 10,
    color: colors.textMuted,
    lineHeight: 14,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.success50 ?? '#ecfdf5',
    borderRadius: radius.pill,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  verifiedText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.success600,
  },
  reviewRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  reviewRatingNum: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent600,
    lineHeight: 14,
  },
  reviewTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textStrong,
    lineHeight: 18,
    marginTop: 2,
  },
  reviewBody: {
    fontSize: 12,
    color: colors.textBody,
    lineHeight: 17,
    marginTop: 1,
  },

  /* ── Load more ── */
  loadMoreBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.brand600,
  },
  pressed: {
    opacity: 0.75,
  },
});
