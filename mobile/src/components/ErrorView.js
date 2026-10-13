import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from './AppButton.js';
import { colors } from '../theme/colors.js';
import { spacing, typography } from '../theme/spacing.js';

/** A real, actionable error state -- never a silent failure, never a fabricated success. */
export function ErrorView({ title = 'Something went wrong', message, onRetry }) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="cloud-offline-outline" size={28} color={colors.danger600} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {onRetry && <AppButton title="Try again" onPress={onRetry} variant="secondary" size="sm" style={styles.button} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xxl },
  iconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.danger50, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  title: { ...typography.h2, color: colors.textStrong },
  message: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  button: { marginTop: spacing.md, minWidth: 140 },
});
