import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

/**
 * A single tappable summary bar (destination · dates · guests) that opens the full search form --
 * mirrors the website's SearchWidget "compact" mode. Kept as one component so Home and Search Results
 * show an identical, tappable summary of the current search.
 */
export function SearchBar({ destinationLabel, dateLabel, guestsLabel, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.bar, shadow.card, pressed && styles.pressed]}>
      <Ionicons name="search" size={18} color={colors.brand600} style={styles.icon} />
      <View style={styles.textCol}>
        <Text style={styles.destination} numberOfLines={1}>{destinationLabel || 'Where do you want to stay?'}</Text>
        <Text style={styles.meta} numberOfLines={1}>{[dateLabel, guestsLabel].filter(Boolean).join(' · ')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceCard,
    borderRadius: radius.card, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md,
  },
  pressed: { opacity: 0.9 },
  icon: { marginTop: 1 },
  textCol: { flex: 1, gap: 2 },
  destination: { ...typography.bodyStrong, color: colors.textStrong },
  meta: { ...typography.caption, color: colors.textMuted },
});
