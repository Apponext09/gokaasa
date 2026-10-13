import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors.js';
import { spacing, typography } from '../theme/spacing.js';

export function SectionHeader({ title, actionLabel, onAction }) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {actionLabel && onAction && (
        <Pressable onPress={onAction}>
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { ...typography.h1, color: colors.textStrong },
  action: { ...typography.caption, fontWeight: '600', color: colors.brand600 },
});
