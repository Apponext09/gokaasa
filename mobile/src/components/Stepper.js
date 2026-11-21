import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors.js';
import { spacing, typography } from '../theme/spacing.js';

/** A +/- counter used for adults, children, and rooms -- min/max are always passed in by the caller
 * (the real occupancy limits from constants/booking.js), never hardcoded per use. */
export function Stepper({ label, hint, value, min = 0, max = 99, onChange }) {
  return (
    <View style={styles.row}>
      <View style={styles.labelCol}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <View style={styles.controls}>
        <Pressable
          onPress={() => value > min && onChange(value - 1)}
          disabled={value <= min}
          style={[styles.button, value <= min && styles.buttonDisabled]}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <Ionicons name="remove" size={16} color={value <= min ? colors.textMuted : colors.brand700} />
        </Pressable>
        <Text style={styles.value}>{value}</Text>
        <Pressable
          onPress={() => value < max && onChange(value + 1)}
          disabled={value >= max}
          style={[styles.button, value >= max && styles.buttonDisabled]}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <Ionicons name="add" size={16} color={value >= max ? colors.textMuted : colors.brand700} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  labelCol: { flex: 1, marginRight: spacing.sm },
  label: { ...typography.body, color: colors.textStrong },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  button: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSubtle, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.4 },
  value: { ...typography.bodyStrong, color: colors.textStrong, minWidth: 20, textAlign: 'center' },
});
