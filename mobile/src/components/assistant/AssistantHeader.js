import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors.js';
import { radius, spacing, typography } from '../../theme/spacing.js';
import { LANGUAGES, t } from '../../features/assistant/bilingualContent.js';

/**
 * Premium concierge header -- branding, language toggle, an optional spoken-response toggle (only shown
 * when text-to-speech is actually available on this device), and the single close action. Mirrors the
 * website's AssistantHeader.jsx field-for-field, minus the website's "replay last response" control,
 * which has no equivalent need here (the screen never navigates away mid-answer the way a floating panel
 * losing focus could).
 */
export function AssistantHeader({ lang, onChangeLanguage, speechSupported, speechEnabled, onToggleSpeech, showRestart, onRestart, onClose }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: Math.max(spacing.md, insets.top) }]}>
      <View style={styles.topRow}>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Ionicons name="sparkles" size={18} color={colors.white} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.title} numberOfLines={1}>{t('conciergeTitle', lang)}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{t('conciergeSubtitle', lang)}</Text>
          </View>
        </View>
        <View style={styles.actions}>
          {speechSupported && (
            <Pressable
              onPress={onToggleSpeech}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel={speechEnabled ? t('speakToggleOn', lang) : t('speakToggleOff', lang)}
            >
              <Ionicons name={speechEnabled ? 'volume-high-outline' : 'volume-mute-outline'} size={20} color={colors.textStrong} />
            </Pressable>
          )}
          {showRestart && (
            <Pressable onPress={onRestart} style={styles.iconButton} accessibilityRole="button" accessibilityLabel={t('restartLabel', lang)}>
              <Ionicons name="refresh-outline" size={19} color={colors.textStrong} />
            </Pressable>
          )}
          <Pressable onPress={onClose} style={styles.iconButton} accessibilityRole="button" accessibilityLabel={t('closeChat', lang)}>
            <Ionicons name="close" size={20} color={colors.textStrong} />
          </Pressable>
        </View>
      </View>
      <View style={styles.langRow}>
        {LANGUAGES.map((l) => (
          <Pressable
            key={l.code}
            onPress={() => onChangeLanguage(l.code)}
            style={[styles.langChip, lang === l.code && styles.langChipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: lang === l.code }}
          >
            <Text style={[styles.langChipText, lang === l.code && styles.langChipTextActive]}>{l.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.surfaceCard, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  flex1: { flexShrink: 1 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brand700, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.bodyStrong, color: colors.textStrong },
  subtitle: { ...typography.caption, color: colors.textMuted },
  actions: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  langRow: { flexDirection: 'row', gap: spacing.xs },
  langChip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderSubtle, paddingHorizontal: spacing.md, paddingVertical: 5 },
  langChipActive: { backgroundColor: colors.brand600, borderColor: colors.brand600 },
  langChipText: { ...typography.tiny, color: colors.textBody, fontWeight: '600' },
  langChipTextActive: { color: colors.white },
});
