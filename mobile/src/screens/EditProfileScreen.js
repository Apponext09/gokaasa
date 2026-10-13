import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer.js';
import { AppInput } from '../components/AppInput.js';
import { FadeSlideIn } from '../components/FadeSlideIn.js';
import { useAuth } from '../context/AuthContext.js';
import { colors } from '../theme/colors.js';
import { radius, spacing, typography } from '../theme/spacing.js';

/**
 * HONEST LIMITATION: the backend (checked backend/src/routes) has no profile-update endpoint today --
 * only GET /api/auth/me. Rather than fake a save that does nothing server-side, this screen shows the
 * real account fields read-only and says so plainly, instead of silently discarding an edit.
 */
export default function EditProfileScreen() {
  const { user } = useAuth();

  return (
    <ScreenContainer edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <FadeSlideIn style={styles.notice}>
          <Ionicons name="information-circle-outline" size={18} color={colors.warning600} />
          <Text style={styles.noticeText}>
            Editing your profile isn't available yet -- the server doesn't have an update-profile endpoint. These
            fields are shown read-only so nothing you change here is silently lost.
          </Text>
        </FadeSlideIn>
        <AppInput label="First name" value={user?.firstName ?? ''} editable={false} />
        <AppInput label="Last name" value={user?.lastName ?? ''} editable={false} />
        <AppInput label="Email" value={user?.email ?? ''} editable={false} />
        <AppInput label="Phone" value={user?.phone ?? '—'} editable={false} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  notice: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.warning50, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.sm },
  noticeText: { ...typography.caption, color: colors.warning600, flex: 1 },
});
