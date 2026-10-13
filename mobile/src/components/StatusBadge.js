import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors.js';
import { radius, spacing } from '../theme/spacing.js';

const TONES = {
  brand: { bg: colors.brand50, text: colors.brand700 },
  success: { bg: colors.success50, text: colors.success600 },
  warning: { bg: colors.warning50, text: colors.warning600 },
  danger: { bg: colors.danger50, text: colors.danger600 },
  neutral: { bg: colors.surfaceMuted, text: colors.textBody },
  premium: { bg: colors.accent100, text: colors.accent700 },
};

export function StatusBadge({ label, tone = 'neutral' }) {
  const t = TONES[tone] ?? TONES.neutral;
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.text, { color: t.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  text: { fontSize: 11, fontWeight: '600' },
});
