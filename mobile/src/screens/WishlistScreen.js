import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorView } from '../components/ErrorView.js';
import { LoadingView } from '../components/LoadingView.js';
import { HotelCard } from '../components/HotelCard.js';
import { AppButton } from '../components/AppButton.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { useAuth } from '../context/AuthContext.js';
import { useWishlist } from '../context/WishlistContext.js';
import { useBookingSearch } from '../context/BookingSearchContext.js';
import { colors } from '../theme/colors.js';
import { spacing, typography } from '../theme/spacing.js';

export default function WishlistScreen({ navigation }) {
  const { isAuthenticated } = useAuth();
  const { items, status, refresh } = useWishlist();
  const { checkIn, checkOut, rooms } = useBookingSearch();

  if (!isAuthenticated) {
    return (
      <ScreenContainer>
        <View style={styles.header}>
          <Text style={styles.title}>My Wishlist</Text>
        </View>
        <EmptyState
          icon="heart-outline"
          title="Sign in to save hotels"
          message="Tap the heart on any hotel to save it here for later."
          action={<AppButton title="Sign in" onPress={() => navigation.navigate('Auth', { screen: 'Login' })} />}
        />
      </ScreenContainer>
    );
  }

  if (status === 'loading' && items.length === 0) return <LoadingView label="Loading your wishlist…" />;
  if (status === 'error') return <ErrorView message="We couldn't load your wishlist right now." onRetry={refresh} />;
  if (status === 'ready' && items.length === 0) {
    return (
      <ScreenContainer>
        <View style={styles.header}>
          <Text style={styles.title}>My Wishlist</Text>
        </View>
        <EmptyState icon="heart-outline" title="Your wishlist is empty" message="Hotels you save will show up here." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>My Wishlist</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(h) => String(h.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={status === 'loading'} onRefresh={refresh} tintColor={colors.brand600} />}
        ListHeaderComponent={<Text style={styles.count}>{items.length} saved stay{items.length === 1 ? '' : 's'}</Text>}
        renderItem={({ item, index }) => (
          <FadeSlideIn delay={Math.min(index, 4) * 50}>
            <HotelCard hotel={item} onPress={() => navigation.navigate('HotelDetails', { idOrSlug: item.slug, checkIn, checkOut, occupancy: rooms })} />
          </FadeSlideIn>
        )}
      />
    </ScreenContainer>
  );
}

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
  list: { padding: spacing.lg, paddingTop: spacing.xs },
  count: { ...typography.caption, color: colors.textMuted, fontWeight: '600', marginBottom: spacing.sm },
});
