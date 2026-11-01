import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors.js';
import { radius, shadow, spacing, typography } from '../../theme/spacing.js';
import { nightsBetween } from '../../utils/format.js';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const referenceDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Month grid for a given year and month (0-based), Monday first, all in UTC date arithmetic -- mirrors
 * the website's DateRangePicker.jsx#monthGrid exactly, which this component otherwise ports to native. */
function monthGrid(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < offset; i += 1) cells.push(null);
  for (let d = 1; d <= days; d += 1) cells.push(new Date(Date.UTC(year, month, d)).toISOString().slice(0, 10));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * Compact, always-in-flow check-in/check-out calendar for the chat's DATES step -- a native port of the
 * website's DateRangePicker.jsx `inline` mode (same auto-advance and auto-collapse behavior), replacing
 * two independent native-OS date pickers with a single month grid: picking check-in alone keeps the
 * calendar open and switches its hint to check-out; picking check-out collapses it to a one-line summary
 * with a "Change" action to reopen it.
 */
export function InlineDateRangePicker({ checkIn, checkOut, onChange, min }) {
  const [editing, setEditing] = useState(() => !(checkIn && checkOut));
  const anchor = checkIn && checkIn >= min ? checkIn : min;
  const [cursor, setCursor] = useState(() => ({ year: Number(anchor.slice(0, 4)), month: Number(anchor.slice(5, 7)) - 1 }));

  // AssistantScreen pre-fills checkIn/checkOut to tomorrow/the day after the FIRST time this step is
  // reached with nothing chosen yet (see its own comment on that effect) -- that happens one render
  // after this component mounts with both still null, so the `editing` initializer above (computed only
  // once, at mount) never sees the filled-in values. Adjusted here during render (React's own pattern for
  // reacting to a prop change, not a useEffect) rather than left open in editing mode forever after a
  // prefill, the way a real user selection already collapses it.
  const [hadBoth, setHadBoth] = useState(Boolean(checkIn && checkOut));
  const hasBothNow = Boolean(checkIn && checkOut);
  if (hasBothNow !== hadBoth) {
    setHadBoth(hasBothNow);
    if (hasBothNow) setEditing(false);
    else setEditing(true);
  }

  const cells = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const monthLabel = new Date(Date.UTC(cursor.year, cursor.month, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const minMonth = Number(min.slice(0, 4)) * 12 + Number(min.slice(5, 7)) - 1;
  const shownMonth = cursor.year * 12 + cursor.month;
  const nights = nightsBetween(checkIn, checkOut);

  const pick = (day) => {
    if (day < min) return;
    if (!checkIn || (checkIn && checkOut) || day <= checkIn) {
      onChange({ checkIn: day, checkOut: null });
      return;
    }
    onChange({ checkIn, checkOut: day });
    setEditing(false);
  };

  const shift = (delta) => {
    setCursor((c) => {
      const next = new Date(Date.UTC(c.year, c.month + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });
  };

  const hint = !checkIn ? 'Select check-in' : !checkOut ? 'Now select check-out' : null;

  if (!editing && checkIn && checkOut) {
    return (
      <View style={styles.summaryRow}>
        <View style={styles.summaryTextWrap}>
          <Text style={styles.summaryText} numberOfLines={1}>
            {referenceDate(checkIn)} <Text style={styles.summaryArrow}>→</Text> {referenceDate(checkOut)}
          </Text>
          <Text style={styles.nightsText}>{nights} night{nights === 1 ? '' : 's'}</Text>
        </View>
        <Pressable onPress={() => setEditing(true)} style={styles.changeButton} accessibilityRole="button">
          <Text style={styles.changeButtonText}>Change</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, shadow.subtle]}>
      <View style={styles.header}>
        <Pressable
          disabled={shownMonth <= minMonth}
          onPress={() => shift(-1)}
          style={[styles.navButton, shownMonth <= minMonth && styles.navButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Ionicons name="chevron-back" size={16} color={colors.textStrong} />
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <Pressable onPress={() => shift(1)} style={styles.navButton} accessibilityRole="button" accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={16} color={colors.textStrong} />
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekdayText}>{w}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (!day) return <View key={`blank-${index}`} style={styles.cell} />;
          const isPast = day < min;
          const isStart = day === checkIn;
          const isEnd = day === checkOut;
          const inRange = Boolean(checkIn && checkOut && day > checkIn && day < checkOut);
          return (
            <Pressable
              key={day}
              disabled={isPast}
              onPress={() => pick(day)}
              style={[styles.cell, inRange && styles.cellInRange]}
              accessibilityRole="button"
              accessibilityState={{ disabled: isPast, selected: isStart || isEnd }}
            >
              <View style={[styles.dayCircle, (isStart || isEnd) && styles.dayCircleSelected]}>
                <Text style={[styles.dayText, isPast && styles.dayTextPast, (isStart || isEnd) && styles.dayTextSelected]}>
                  {Number(day.slice(8))}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Text style={styles.hintText}>{hint ?? (nights ? `${nights} night${nights === 1 ? '' : 's'}` : '')}</Text>
        {checkIn && (
          <Pressable onPress={() => onChange({ checkIn: null, checkOut: null })} style={styles.clearButton} accessibilityRole="button">
            <Ionicons name="close" size={12} color={colors.textMuted} />
            <Text style={styles.clearButtonText}>Clear</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const CELL_SIZE = 34;

const styles = StyleSheet.create({
  container: { backgroundColor: colors.surfaceCard, borderRadius: radius.card, borderWidth: 1, borderColor: colors.borderSubtle, padding: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  navButton: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  navButtonDisabled: { opacity: 0.3 },
  monthLabel: { ...typography.bodyStrong, color: colors.textStrong },
  weekdayRow: { flexDirection: 'row' },
  weekdayText: { ...typography.tiny, color: colors.textMuted, width: `${100 / 7}%`, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  cell: { width: `${100 / 7}%`, height: CELL_SIZE, alignItems: 'center', justifyContent: 'center' },
  cellInRange: { backgroundColor: colors.brand50 },
  dayCircle: { width: CELL_SIZE - 6, height: CELL_SIZE - 6, borderRadius: (CELL_SIZE - 6) / 2, alignItems: 'center', justifyContent: 'center' },
  dayCircleSelected: { backgroundColor: colors.brand600 },
  dayText: { ...typography.caption, color: colors.textStrong },
  dayTextPast: { color: colors.textMuted, opacity: 0.5, textDecorationLine: 'line-through' },
  dayTextSelected: { color: colors.white, fontWeight: '700' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  hintText: { ...typography.caption, color: colors.textMuted },
  clearButton: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4, paddingHorizontal: spacing.xs },
  clearButtonText: { ...typography.caption, color: colors.textMuted },
  summaryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm,
    backgroundColor: colors.surfaceCard, borderRadius: radius.control, borderWidth: 1, borderColor: colors.borderSubtle,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  summaryTextWrap: { flexShrink: 1 },
  summaryText: { ...typography.bodyStrong, color: colors.textStrong },
  summaryArrow: { color: colors.textMuted },
  nightsText: { ...typography.tiny, color: colors.textMuted, marginTop: 1 },
  changeButton: { paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: radius.pill },
  changeButtonText: { ...typography.captionStrong, color: colors.brand600 },
});
