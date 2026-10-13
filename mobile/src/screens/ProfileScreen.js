import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { EmptyState } from '../components/EmptyState.js';
import { AppButton } from '../components/AppButton.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { useAuth } from '../context/AuthContext.js';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

export default function ProfileScreen({ navigation }) {
  const { user, isAuthenticated, logout } = useAuth();

  if (!isAuthenticated) {
    return (
      <ScreenContainer>
        <EmptyState
          image={require('../../assets/icon.png')}
          imageLabel="Gokaasa"
          title="Sign in to your account"
          message="See your profile, trips, and wishlist once you're signed in."
          action={<AppButton title="Sign in" onPress={() => navigation.navigate('Auth', { screen: 'Login' })} />}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <FadeSlideIn style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitials}>{(user.firstName?.[0] ?? '').toUpperCase()}{(user.lastName?.[0] ?? '').toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{user.firstName} {user.lastName}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </FadeSlideIn>

        <FadeSlideIn delay={80} style={[styles.menuCard, shadow.card]}>
          <MenuRow icon="create-outline" label="Edit profile" onPress={() => navigation.navigate('EditProfile')} />
          <MenuRow icon="notifications-outline" label="Notifications" onPress={() => navigation.navigate('Notifications')} />
          <MenuRow icon="briefcase-outline" label="My Trips" onPress={() => navigation.navigate('Main', { screen: 'MyTrips' })} />
          <MenuRow icon="heart-outline" label="Wishlist" onPress={() => navigation.navigate('Main', { screen: 'Wishlist' })} last />
        </FadeSlideIn>

        <AppButton title="Log out" variant="secondary" icon={<Ionicons name="log-out-outline" size={18} color={colors.textStrong} />} onPress={logout} style={styles.logout} />
      </ScrollView>
    </ScreenContainer>
  );
}

function MenuRow({ icon, label, onPress, last }) {
  return (
    <Pressable style={({ pressed }) => [styles.menuRow, !last && styles.menuRowBorder, pressed && styles.menuRowPressed]} onPress={onPress}>
      <View style={styles.menuIconWrap}>
        <Ionicons name={icon} size={18} color={colors.brand600} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  avatarWrap: { alignItems: 'center', gap: 4, marginTop: spacing.md },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.brand600, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: colors.white, fontSize: 26, fontWeight: '700' },
  name: { ...typography.h1, color: colors.textStrong, marginTop: spacing.sm },
  email: { ...typography.caption, color: colors.textMuted },
  menuCard: { backgroundColor: colors.surfaceCard, borderRadius: radius.card, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  menuRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  menuRowPressed: { backgroundColor: colors.surfaceMuted },
  menuIconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { ...typography.body, color: colors.textStrong, flex: 1 },
  logout: { marginTop: spacing.sm },
});
