import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors.js';
import { spacing, typography } from '../theme/spacing.js';

export function LoadingView({ label = 'Loading…' }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.brand600} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl },
  label: { ...typography.body, color: colors.textMuted },
});
