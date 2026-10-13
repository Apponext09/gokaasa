import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorView } from '../components/ErrorView.js';
import { LoadingView } from '../components/LoadingView.js';
import { AppButton } from '../components/AppButton.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { notificationsApi } from '../api/notificationsApi.js';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

/** Links a notification to its own real entity -- unknown/missing entities still show, just aren't tappable. */
function notificationTarget(notification) {
  if (notification.entityType === 'booking' && notification.entityId) {
    return { screen: 'BookingDetails', params: { bookingId: notification.entityId } };
  }
  return null;
}

export default function NotificationsScreen({ navigation }) {
  const [state, setState] = useState({ status: 'loading', items: [], error: null });

  const load = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading' }));
    notificationsApi
      .list({ page: 1 })
      .then((data) => setState({ status: 'ready', items: data.items ?? [], error: null }))
      .catch((err) => setState({ status: 'error', items: [], error: err.message }));
  }, []);

  useEffect(load, [load]);

  const markOneRead = async (id) => {
    setState((s) => ({ ...s, items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)) }));
    await notificationsApi.markRead(id).catch(() => {});
  };

  const markAllRead = async () => {
    setState((s) => ({ ...s, items: s.items.map((n) => ({ ...n, read: true })) }));
    await notificationsApi.markAllRead().catch(() => {});
  };

  if (state.status === 'loading') return <LoadingView label="Loading notifications…" />;
  if (state.status === 'error') return <ErrorView message={state.error} onRetry={load} />;
  if (state.items.length === 0) return <EmptyState icon="notifications-outline" title="No notifications yet" message="Updates about your bookings will appear here." />;

  const unreadCount = state.items.filter((n) => !n.read).length;

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <Text style={styles.headerCount}>{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</Text>
        {unreadCount > 0 && <AppButton title="Mark all as read" variant="ghost" size="sm" onPress={markAllRead} />}
      </View>
      <FlatList
        data={state.items}
        keyExtractor={(n) => String(n.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => {
          const target = notificationTarget(item);
          return (
            <FadeSlideIn delay={Math.min(index, 5) * 40}>
              <Pressable
                style={({ pressed }) => [styles.row, shadow.card, !item.read && styles.rowUnread, pressed && styles.rowPressed]}
                onPress={() => {
                  markOneRead(item.id);
                  if (target) navigation.navigate(target.screen, target.params);
                }}
              >
                <View style={styles.iconWrap}>
                  <Ionicons name="notifications" size={16} color={colors.brand600} />
                  {!item.read && <View style={styles.dot} />}
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.message}>{item.message}</Text>
                  <Text style={styles.time}>{new Date(item.createdAt).toLocaleString('en-IN')}</Text>
                </View>
                {target && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
              </Pressable>
            </FadeSlideIn>
          );
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  headerCount: { ...typography.caption, color: colors.textMuted, fontWeight: '600' },
  list: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surfaceCard, borderRadius: radius.card, marginBottom: spacing.sm },
  rowUnread: { borderWidth: 1, borderColor: colors.brand200 },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  iconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger600 },
  flex1: { flex: 1 },
  title: { ...typography.bodyStrong, color: colors.textStrong },
  message: { ...typography.caption, color: colors.textMuted },
  time: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
});
