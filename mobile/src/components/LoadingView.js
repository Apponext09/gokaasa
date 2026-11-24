import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

export function LoadingView({ label = 'Loading…', showLogo = false }) {
  if (showLogo) {
    return (
      <View style={styles.screen}>
        <View style={[styles.card, shadow.floating]}>
          <View style={styles.logoWrap}>
            <Image
              source={require('../../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Gokaasa"
            />
            <Text style={styles.tagline}>Curated Stays & Resorts</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.statusPill}>
            <ActivityIndicator size="small" color={colors.brand600} />
            <Text style={styles.cardLabel}>{label}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ActivityIndicator size="large" color={colors.brand600} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.surfacePage,
  },
  card: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.card * 2,
    paddingVertical: 44,
    paddingHorizontal: spacing.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    width: '92%',
    maxWidth: 380,
    minHeight: 270,
    gap: spacing.xl,
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  logo: {
    width: 240,
    height: 62,
  },
  tagline: {
    ...typography.caption,
    fontSize: 12,
    color: colors.accent600,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginTop: 4,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: colors.borderSubtle,
    opacity: 0.85,
    marginVertical: spacing.xs,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.brand50,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.pill,
  },
  cardLabel: {
    ...typography.bodyStrong,
    color: colors.brand700,
    fontSize: 14,
  },
  label: { ...typography.body, color: colors.textMuted },
});
