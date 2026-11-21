import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors.js';
import { radius, spacing, typography } from '../theme/spacing.js';
import { formatStayDate } from '../utils/format.js';

function parseLocalDate(str) {
  if (!str) return new Date();
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * One date field (check-in or check-out).
 * On Android: uses DateTimePickerAndroid.open() imperative API directly to avoid re-render loops and dialog resets.
 * On iOS: uses standard conditional DateTimePicker.
 */
export function DateField({ label, value, onChange, minimumDate }) {
  const [iosOpen, setIosOpen] = useState(false);

  const handlePress = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: parseLocalDate(value),
        mode: 'date',
        minimumDate: minimumDate ? parseLocalDate(minimumDate) : undefined,
        onChange: (event, selected) => {
          if (event.type === 'set' && selected) {
            onChange(formatLocalDate(selected));
          }
        },
      });
    } else {
      setIosOpen(true);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.field} onPress={handlePress}>
        <Ionicons name="calendar-outline" size={16} color={colors.brand600} />
        <Text style={styles.value}>
          {value ? formatStayDate(value, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Select date'}
        </Text>
      </Pressable>
      {Platform.OS === 'ios' && iosOpen && (
        <DateTimePicker
          value={parseLocalDate(value)}
          mode="date"
          minimumDate={minimumDate ? parseLocalDate(minimumDate) : undefined}
          onChange={(event, selected) => {
            setIosOpen(false);
            if (event.type === 'set' && selected) {
              onChange(formatLocalDate(selected));
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: spacing.md,
  },
  value: { ...typography.body, color: colors.textStrong },
});
