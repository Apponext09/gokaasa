import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DateField } from './DateField.js';
import { GuestsModal } from './GuestsModal.js';
import { AppButton } from './AppButton.js';
import { addDaysIso, formatStayDate, occupancyLabel, summarizeOccupancy, nightsBetween, todayIso } from '../utils/format.js';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

/**
 * Collapsed tappable bar that sits at the very top of a screen (above the gallery / room list).
 * Tap → bottom-sheet modal with DateField (check-in), DateField (check-out), guests summary + GuestsModal.
 * Mirrors the web's QuickReserveSearchBar intent but uses the native OS date picker and the existing
 * GuestsModal so the UX feels the same as every other date/guest picker in the app.
 *
 * Props:
 *   checkIn      – ISO date string e.g. "2026-12-01"
 *   checkOut     – ISO date string
 *   occupancy    – array of { adults, childAges }
 *   hotelName    – string shown as destination label in the collapsed bar
 *   onApply(newCheckIn, newCheckOut, newOccupancy) – called when guest taps Apply
 */
export function StaySearchBar({ checkIn, checkOut, occupancy, hotelName, onApply }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [guestsOpen, setGuestsOpen] = useState(false);

  // Draft state inside the sheet — only committed when Apply is tapped
  const [draftCheckIn, setDraftCheckIn] = useState(checkIn);
  const [draftCheckOut, setDraftCheckOut] = useState(checkOut);
  const [draftOccupancy, setDraftOccupancy] = useState(occupancy);

  // Sync draft whenever parent props change while sheet is closed
  useEffect(() => {
    if (!sheetOpen) {
      setDraftCheckIn(checkIn);
      setDraftCheckOut(checkOut);
      setDraftOccupancy(occupancy);
    }
  }, [checkIn, checkOut, occupancy, sheetOpen]);

  const openSheet = () => {
    // Reset draft to current values whenever sheet is opened
    setDraftCheckIn(checkIn);
    setDraftCheckOut(checkOut);
    setDraftOccupancy(occupancy);
    setSheetOpen(true);
  };

  const handleApply = () => {
    if (!draftCheckIn || !draftCheckOut || draftCheckOut <= draftCheckIn) return;
    setSheetOpen(false);
    onApply(draftCheckIn, draftCheckOut, draftOccupancy);
  };

  // Collapsed bar labels
  const dateLabel =
    checkIn && checkOut
      ? `${formatStayDate(checkIn, { day: 'numeric', month: 'short' })} – ${formatStayDate(checkOut, { day: 'numeric', month: 'short' })}`
      : 'Select dates';
  const guestsLbl = summarizeOccupancy(occupancy);
  const nights =
    draftCheckIn && draftCheckOut && draftCheckOut > draftCheckIn
      ? nightsBetween(draftCheckIn, draftCheckOut)
      : 0;

  const today = todayIso();

  return (
    <>
      {/* ── Collapsed bar ─────────────────────────────────────────── */}
      <Pressable
        onPress={openSheet}
        style={({ pressed }) => [styles.bar, shadow.card, pressed && styles.barPressed]}
        accessibilityRole="button"
        accessibilityLabel="Change stay dates or guests"
      >
        <View style={styles.barLeft}>
          <Ionicons name="calendar-outline" size={18} color={colors.brand600} />
          <View style={styles.barText}>
            <Text style={styles.barDates} numberOfLines={1}>{dateLabel}</Text>
            <Text style={styles.barGuests} numberOfLines={1}>{guestsLbl}</Text>
          </View>
        </View>
        <View style={styles.barEditChip}>
          <Ionicons name="create-outline" size={14} color={colors.brand600} />
          <Text style={styles.barEditText}>Edit</Text>
        </View>
      </Pressable>

      {/* ── Bottom-sheet modal ─────────────────────────────────────── */}
      <Modal
        visible={sheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setSheetOpen(false)}
      >
        <View style={styles.modalOverlay}>
          {/* Backdrop — tap to dismiss */}
          <Pressable style={styles.backdrop} onPress={() => setSheetOpen(false)} />

          {/* Sheet */}
          <View style={styles.sheet}>
            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Change stay</Text>
              <Pressable onPress={() => setSheetOpen(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.textStrong} />
              </Pressable>
            </View>

            {/* Destination row (read-only label) */}
            {hotelName ? (
              <View style={styles.destinationRow}>
                <Ionicons name="location-outline" size={15} color={colors.textMuted} />
                <Text style={styles.destinationText} numberOfLines={1}>{hotelName}</Text>
              </View>
            ) : null}

            {/* Nights badge */}
            {nights > 0 && (
              <View style={styles.nightsBadge}>
                <Ionicons name="moon-outline" size={13} color={colors.brand600} />
                <Text style={styles.nightsText}>
                  {nights} {nights === 1 ? 'night' : 'nights'}
                </Text>
              </View>
            )}

            {/* Date fields — side by side */}
            <View style={styles.dateRow}>
              <DateField
                label="Check-in"
                value={draftCheckIn}
                minimumDate={today}
                onChange={(d) => {
                  setDraftCheckIn(d);
                  // Auto-push check-out if it's now ≤ check-in
                  if (!draftCheckOut || draftCheckOut <= d) {
                    setDraftCheckOut(addDaysIso(d, 1));
                  }
                }}
              />
              <DateField
                label="Check-out"
                value={draftCheckOut}
                minimumDate={draftCheckIn ? addDaysIso(draftCheckIn, 1) : today}
                onChange={setDraftCheckOut}
              />
            </View>

            {/* Guests row */}
            <View style={styles.guestsSection}>
              <Text style={styles.guestsLabel}>Rooms & Guests</Text>
              <Pressable
                style={styles.guestsButton}
                onPress={() => setGuestsOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Choose rooms and guests"
              >
                <Ionicons name="people-outline" size={16} color={colors.brand600} />
                <Text style={styles.guestsButtonText} numberOfLines={1}>
                  {summarizeOccupancy(draftOccupancy)}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            </View>

            {/* Validation hint */}
            {draftCheckIn && draftCheckOut && draftCheckOut <= draftCheckIn && (
              <Text style={styles.errorText}>Check-out must be after check-in</Text>
            )}

            {/* Apply */}
            <AppButton
              title="Apply"
              accessibilityLabel="Apply stay changes"
              onPress={handleApply}
              style={styles.applyButton}
              disabled={!draftCheckIn || !draftCheckOut || draftCheckOut <= draftCheckIn}
            />
          </View>
        </View>
      </Modal>

      {/* GuestsModal — rendered outside the sheet so it stacks above it */}
      <GuestsModal
        visible={guestsOpen}
        rooms={draftOccupancy}
        onChange={(newRooms) => setDraftOccupancy(newRooms)}
        onClose={() => setGuestsOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  /* ── Collapsed bar ──────────────────────────────── */
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: 2,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  barPressed: { opacity: 0.85 },
  barLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 },
  barText: { flex: 1, minWidth: 0 },
  barDates: { ...typography.bodyStrong, color: colors.textStrong },
  barGuests: { ...typography.caption, color: colors.textMuted, marginTop: 1 },
  barEditChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand50 ?? '#eff6ff',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  barEditText: { ...typography.captionStrong, color: colors.brand600, fontSize: 12 },

  /* ── Modal backdrop ─────────────────────────────── */
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,23,38,0.4)',
  },

  /* ── Bottom sheet ───────────────────────────────── */
  sheet: {
    backgroundColor: colors.surfaceCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  sheetTitle: { ...typography.h1, color: colors.textStrong },

  destinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  destinationText: { ...typography.body, color: colors.textBody, flex: 1 },

  nightsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: colors.brand50 ?? '#eff6ff',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  nightsText: { ...typography.captionStrong, color: colors.brand600 },

  /* ── Date fields ────────────────────────────────── */
  dateRow: { flexDirection: 'row', gap: spacing.md },

  /* ── Guests ─────────────────────────────────────── */
  guestsSection: { gap: spacing.xs },
  guestsLabel: { ...typography.caption, fontWeight: '600', color: colors.textStrong },
  guestsButton: {
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
  guestsButtonText: { ...typography.body, color: colors.textStrong, flex: 1 },

  errorText: { ...typography.caption, color: colors.danger600 ?? '#dc2626' },
  applyButton: { marginTop: spacing.xs },
});
