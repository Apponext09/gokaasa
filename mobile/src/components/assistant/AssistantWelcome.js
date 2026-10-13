import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors.js';
import { radius, shadow, spacing, typography } from '../../theme/spacing.js';
import { t } from '../../features/assistant/bilingualContent.js';

/** The first-time quick-action grid -- each action triggers REAL app behaviour (sets a real propertyType
 * and advances the real step machine, or navigates to the real My Trips tab), never a canned reply with
 * nothing behind it. Mirrors the website's AssistantWelcome.jsx. */
export function AssistantWelcome({ lang, onFindHotels, onExploreDestinations, onFindResorts, onSearchByBudget, onHelpWithBooking, onUseExample }) {
  const actions = [
    { icon: 'business-outline', title: t('quickFindHotelsTitle', lang), desc: t('quickFindHotelsDesc', lang), onPress: onFindHotels },
    { icon: 'compass-outline', title: t('quickExploreTitle', lang), desc: t('quickExploreDesc', lang), onPress: onExploreDestinations },
    { icon: 'leaf-outline', title: t('quickFindResortsTitle', lang), desc: t('quickFindResortsDesc', lang), onPress: onFindResorts },
    { icon: 'wallet-outline', title: t('quickBudgetTitle', lang), desc: t('quickBudgetDesc', lang), onPress: onSearchByBudget },
    { icon: 'help-circle-outline', title: t('quickHelpTitle', lang), desc: t('quickHelpDesc', lang), onPress: onHelpWithBooking },
  ];
  const examples = [t('examplePrompt1', lang), t('examplePrompt2', lang), t('examplePrompt3', lang)];

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {actions.map((a) => (
          <Pressable key={a.title} style={[styles.card, shadow.subtle]} onPress={a.onPress}>
            <View style={styles.iconWrap}>
              <Ionicons name={a.icon} size={18} color={colors.accent700} />
            </View>
            <Text style={styles.cardTitle}>{a.title}</Text>
            <Text style={styles.cardDesc}>{a.desc}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.examplesLabel}>{t('examplePromptsLabel', lang)}</Text>
      <View style={styles.examplesRow}>
        {examples.map((example) => (
          <Pressable key={example} style={styles.exampleChip} onPress={() => onUseExample(example)}>
            <Text style={styles.exampleText}>{example}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: { width: '48%', backgroundColor: colors.surfaceCard, borderRadius: radius.card, borderWidth: 1, borderColor: colors.borderSubtle, padding: spacing.md, gap: 2 },
  iconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent100, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  cardTitle: { ...typography.captionStrong, color: colors.textStrong },
  cardDesc: { ...typography.tiny, color: colors.textMuted },
  examplesLabel: { ...typography.tiny, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  examplesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  exampleChip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surfaceCard, paddingHorizontal: spacing.md, paddingVertical: 6 },
  exampleText: { ...typography.tiny, color: colors.textBody, fontWeight: '600' },
});
