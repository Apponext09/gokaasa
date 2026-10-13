import { FlatList, RefreshControl, StyleSheet, Text } from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorView } from '../components/ErrorView.js';
import { LoadingView } from '../components/LoadingView.js';
import { HotelCard } from '../components/HotelCard.js';
import { AppButton } from '../components/AppButton.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { useAuth } from '../context/AuthContext.js';
import { useWishlist } from '../context/WishlistContext.js';
import { colors } from '../theme/colors.js';
import { spacing, typography } from '../theme/spacing.js';

export default function WishlistScreen({ navigation }) {
  const { isAuthenticated } = useAuth();
  const { items, status, refresh } = useWishlist();

  if (!isAuthenticated) {
    return (
      <ScreenContainer>
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
    return <ScreenContainer><EmptyState icon="heart-outline" title="Your wishlist is empty" message="Hotels you save will show up here." /></ScreenContainer>;
  }

  return (
    <ScreenContainer>
      <FlatList
        data={items}
        keyExtractor={(h) => String(h.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={status === 'loading'} onRefresh={refresh} tintColor={colors.brand600} />}
        ListHeaderComponent={<Text style={styles.count}>{items.length} saved stay{items.length === 1 ? '' : 's'}</Text>}
        renderItem={({ item, index }) => (
          <FadeSlideIn delay={Math.min(index, 4) * 50}>
            <HotelCard hotel={item} onPress={() => navigation.navigate('HotelDetails', { idOrSlug: item.slug })} />
          </FadeSlideIn>
        )}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg },
  count: { ...typography.caption, color: colors.textMuted, fontWeight: '600', marginBottom: spacing.sm },
});
