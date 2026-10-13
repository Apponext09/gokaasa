import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors.js';
import { radius, spacing, typography } from '../theme/spacing.js';
import { formatStayDate } from '../utils/format.js';

/** One date field (check-in or check-out). Opens the platform's own native date picker -- never a
 * custom calendar UI, so behaviour matches every other app on the device. */
export function DateField({ label, value, onChange, minimumDate }) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Ionicons name="calendar-outline" size={16} color={colors.brand600} />
        <Text style={styles.value}>{value ? formatStayDate(value, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Select date'}</Text>
      </Pressable>
      {open && (
        <DateTimePicker
          value={value ? new Date(`${value}T00:00:00Z`) : new Date()}
          mode="date"
          minimumDate={minimumDate ? new Date(`${minimumDate}T00:00:00Z`) : undefined}
          onChange={(event, selected) => {
            setOpen(false);
            if (event.type === 'set' && selected) {
              onChange(selected.toISOString().slice(0, 10));
            }
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.xs },
  label: { ...typography.caption, fontWeight: '600', color: colors.textStrong },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 48, borderRadius: radius.control,
    borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surfaceCard, paddingHorizontal: spacing.md,
  },
  value: { ...typography.body, color: colors.textStrong },
});
