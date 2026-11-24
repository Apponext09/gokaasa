import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from './AppButton.js';
import { Stepper } from './Stepper.js';
import { OCCUPANCY_LIMITS } from '../constants/booking.js';
import { summarizeOccupancy } from '../utils/format.js';
import { colors } from '../theme/colors.js';
import { radius, spacing, typography } from '../theme/spacing.js';

function normalizeRooms(rooms, room) {
  if (Array.isArray(rooms) && rooms.length > 0) {
    return rooms.map((r) => ({
      adults: Math.max(OCCUPANCY_LIMITS.minAdults, Math.min(OCCUPANCY_LIMITS.maxAdults, r.adults || 2)),
      childAges: Array.isArray(r.childAges) ? [...r.childAges] : [],
      pets: Math.max(0, Math.min(3, r.pets || 0)),
    }));
  }
  if (room && typeof room === 'object') {
    return [
      {
        adults: Math.max(OCCUPANCY_LIMITS.minAdults, Math.min(OCCUPANCY_LIMITS.maxAdults, room.adults || 2)),
        childAges: Array.isArray(room.childAges) ? [...room.childAges] : [],
        pets: Math.max(0, Math.min(3, room.pets || 0)),
      },
    ];
  }
  return [{ adults: 2, childAges: [], pets: 0 }];
}

/**
 * Multi-room & guests picker bottom sheet modal.
 * Mirrors the website's GuestsPopover: supports up to 8 rooms, adults 1-6,
 * children 0-4 per room, child age selectors (0-17 years), and dynamic summary.
 */
export function GuestsModal({ visible, rooms, room, onChange, onClose }) {
  const [draftRooms, setDraftRooms] = useState(() => normalizeRooms(rooms, room));

  useEffect(() => {
    if (visible) {
      setDraftRooms(normalizeRooms(rooms, room));
    }
  }, [visible, rooms, room]);

  const updateRoomCount = (newCount) => {
    if (newCount < 1 || newCount > OCCUPANCY_LIMITS.maxRooms) return;
    setDraftRooms((prev) => {
      if (newCount > prev.length) {
        const added = Array.from({ length: newCount - prev.length }, () => ({
          adults: 2,
          childAges: [],
          pets: 0,
        }));
        return [...prev, ...added];
      }
      return prev.slice(0, newCount);
    });
  };

  const updateAdults = (roomIdx, adults) => {
    setDraftRooms((prev) => {
      const updated = [...prev];
      updated[roomIdx] = { ...updated[roomIdx], adults };
      return updated;
    });
  };

  const updatePets = (roomIdx, pets) => {
    setDraftRooms((prev) => {
      const updated = [...prev];
      updated[roomIdx] = { ...updated[roomIdx], pets };
      return updated;
    });
  };

  const updateChildrenCount = (roomIdx, count) => {
    setDraftRooms((prev) => {
      const updated = [...prev];
      const currentAges = updated[roomIdx].childAges || [];
      const nextAges =
        count > currentAges.length
          ? [...currentAges, ...Array(count - currentAges.length).fill(7)]
          : currentAges.slice(0, count);
      updated[roomIdx] = { ...updated[roomIdx], childAges: nextAges };
      return updated;
    });
  };

  const updateChildAge = (roomIdx, childIdx, age) => {
    setDraftRooms((prev) => {
      const updated = [...prev];
      const ages = [...updated[roomIdx].childAges];
      ages[childIdx] = age;
      updated[roomIdx] = { ...updated[roomIdx], childAges: ages };
      return updated;
    });
  };

  const removeRoom = (roomIdx) => {
    if (draftRooms.length <= 1) return;
    setDraftRooms((prev) => prev.filter((_, i) => i !== roomIdx));
  };

  const addAnotherRoom = () => {
    if (draftRooms.length >= OCCUPANCY_LIMITS.maxRooms) return;
    setDraftRooms((prev) => [...prev, { adults: 2, childAges: [], pets: 0 }]);
  };

  const handleApply = () => {
    onChange?.(draftRooms);
    onClose?.();
  };

  const summary = summarizeOccupancy(draftRooms);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close modal" />
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.titleWrap}>
              <Text style={styles.sheetTitle}>Rooms & Guests</Text>
              <Text style={styles.summaryBadge}>{summary}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textStrong} />
            </Pressable>
          </View>

          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {/* Top-level total rooms stepper */}
            <View style={styles.totalRoomsCard}>
              <Stepper
                label="Total Rooms"
                hint={`Up to ${OCCUPANCY_LIMITS.maxRooms} rooms`}
                value={draftRooms.length}
                min={1}
                max={OCCUPANCY_LIMITS.maxRooms}
                onChange={updateRoomCount}
              />
              {draftRooms.length >= OCCUPANCY_LIMITS.maxRooms && (
                <Text style={styles.limitMessage}>Maximum {OCCUPANCY_LIMITS.maxRooms} rooms allowed per booking.</Text>
              )}
            </View>

            {/* Room cards */}
            {draftRooms.map((r, roomIdx) => {
              const isOnlyRoom = draftRooms.length === 1;
              const hasChildren = r.childAges && r.childAges.length > 0;

              return (
                <View key={roomIdx} style={styles.roomCard}>
                  <View style={styles.roomCardHeader}>
                    <View style={styles.roomBadge}>
                      <Ionicons name="bed-outline" size={15} color={colors.brand600} />
                      <Text style={styles.roomTitle}>Room {roomIdx + 1}</Text>
                    </View>
                    {!isOnlyRoom && (
                      <Pressable
                        style={styles.removeBtn}
                        onPress={() => removeRoom(roomIdx)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove Room ${roomIdx + 1}`}
                      >
                        <Ionicons name="trash-outline" size={14} color={colors.danger600} />
                        <Text style={styles.removeBtnText}>Remove</Text>
                      </Pressable>
                    )}
                  </View>

                  {/* Adults */}
                  <Stepper
                    label="Adults"
                    hint="Ages 13 and above"
                    value={r.adults}
                    min={OCCUPANCY_LIMITS.minAdults}
                    max={OCCUPANCY_LIMITS.maxAdults}
                    onChange={(v) => updateAdults(roomIdx, v)}
                  />
                  {r.adults >= OCCUPANCY_LIMITS.maxAdults && (
                    <Text style={styles.limitMessage}>Max {OCCUPANCY_LIMITS.maxAdults} adults per room.</Text>
                  )}

                  {/* Children */}
                  <Stepper
                    label="Children"
                    hint="Ages 0 to 17"
                    value={r.childAges.length}
                    min={0}
                    max={OCCUPANCY_LIMITS.maxChildrenPerRoom}
                    onChange={(v) => updateChildrenCount(roomIdx, v)}
                  />
                  {r.childAges.length >= OCCUPANCY_LIMITS.maxChildrenPerRoom && (
                    <Text style={styles.limitMessage}>Max {OCCUPANCY_LIMITS.maxChildrenPerRoom} children per room.</Text>
                  )}

                  {/* Child Ages */}
                  {hasChildren && (
                    <View style={styles.childAgesSection}>
                      <Text style={styles.childAgesTitle}>Age of children</Text>
                      {r.childAges.map((age, childIdx) => (
                        <Stepper
                          key={childIdx}
                          label={`Child ${childIdx + 1} age`}
                          value={age}
                          min={OCCUPANCY_LIMITS.minAge}
                          max={OCCUPANCY_LIMITS.maxAge}
                          onChange={(v) => updateChildAge(roomIdx, childIdx, v)}
                        />
                      ))}
                    </View>
                  )}

                  {/* Pets */}
                  <Stepper
                    label="Pets"
                    hint="Dogs, cats & service animals"
                    value={r.pets || 0}
                    min={0}
                    max={3}
                    onChange={(v) => updatePets(roomIdx, v)}
                  />
                  {(r.pets || 0) >= 3 && (
                    <Text style={styles.limitMessage}>Max 3 pets per room.</Text>
                  )}
                </View>
              );
            })}

            {/* Add another room button */}
            {draftRooms.length < OCCUPANCY_LIMITS.maxRooms && (
              <Pressable style={styles.addRoomButton} onPress={addAnotherRoom} accessibilityRole="button">
                <Ionicons name="add-circle-outline" size={18} color={colors.brand600} />
                <Text style={styles.addRoomText}>Add another room</Text>
              </Pressable>
            )}
          </ScrollView>

          {/* Footer Action */}
          <View style={styles.footer}>
            <AppButton title={`Apply (${summary})`} onPress={handleApply} style={styles.applyButton} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,23,38,0.4)',
  },
  sheet: {
    backgroundColor: colors.surfaceCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  titleWrap: {
    gap: 3,
  },
  sheetTitle: {
    ...typography.h2,
    color: colors.textStrong,
  },
  summaryBadge: {
    ...typography.captionStrong,
    color: colors.brand600,
  },
  scrollArea: {
    maxHeight: 460,
  },
  scrollContent: {
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  totalRoomsCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  roomCard: {
    backgroundColor: colors.surfacePage,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
    gap: spacing.xs,
  },
  roomCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    marginBottom: spacing.xs,
  },
  roomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roomTitle: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  removeBtnText: {
    ...typography.caption,
    color: colors.danger600,
    fontWeight: '600',
  },
  childAgesSection: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    gap: spacing.xs,
  },
  childAgesTitle: {
    ...typography.captionStrong,
    color: colors.textMuted,
    marginBottom: 2,
  },
  limitMessage: {
    ...typography.tiny,
    color: colors.warning700 ?? '#b45309',
    marginTop: -2,
    marginBottom: spacing.xs,
  },
  addRoomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.brand200,
    backgroundColor: colors.brand50,
  },
  addRoomText: {
    ...typography.bodyStrong,
    color: colors.brand600,
  },
  footer: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  applyButton: {
    width: '100%',
  },
});
