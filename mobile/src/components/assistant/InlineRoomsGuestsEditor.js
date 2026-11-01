import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stepper } from '../Stepper.js';
import { OCCUPANCY_LIMITS } from '../../constants/booking.js';
import { colors } from '../../theme/colors.js';
import { radius, spacing, typography } from '../../theme/spacing.js';

const DEFAULT_ROOM = Object.freeze({ adults: 2, childAges: [] });

/**
 * Multi-room rooms & guests editor for the chat's GUESTS step -- a native port of the website's
 * GuestsPopover.jsx `inline` mode. Each room has its own adults/children/child-ages (hotels price and
 * allocate by occupancy per room), with add/remove room, matching OCCUPANCY_LIMITS (the real backend
 * limits, see constants/booking.js). Unlike GuestsModal (used by HomeScreen/SearchScreen, both still
 * single-room today), this always renders in-flow -- no popup -- consistent with every other chat step.
 */
export function InlineRoomsGuestsEditor({ rooms, onChange }) {
  const updateRoom = (index, next) => onChange(rooms.map((room, i) => (i === index ? { ...room, ...next } : room)));

  const setChildCount = (index, count) => {
    const current = rooms[index].childAges;
    const ages = count > current.length ? [...current, ...Array(count - current.length).fill(7)] : current.slice(0, count);
    updateRoom(index, { childAges: ages });
  };

  const removeRoom = (index) => onChange(rooms.filter((_, i) => i !== index));
  const addRoom = () => onChange([...rooms, { ...DEFAULT_ROOM }]);
  const atMaxRooms = rooms.length >= OCCUPANCY_LIMITS.maxRooms;

  return (
    <View style={styles.container}>
      {rooms.map((room, index) => (
        <View key={index} style={styles.roomCard}>
          <View style={styles.roomHeader}>
            <View style={styles.roomTitleRow}>
              <Ionicons name="bed-outline" size={15} color={colors.brand700} />
              <Text style={styles.roomTitle}>Room {index + 1}</Text>
            </View>
            {rooms.length > 1 && (
              <Pressable
                onPress={() => removeRoom(index)}
                style={styles.removeButton}
                accessibilityRole="button"
                accessibilityLabel={`Remove room ${index + 1}`}
              >
                <Ionicons name="trash-outline" size={13} color={colors.danger600} />
                <Text style={styles.removeButtonText}>Remove</Text>
              </Pressable>
            )}
          </View>

          <Stepper
            label="Adults"
            value={room.adults}
            min={OCCUPANCY_LIMITS.minAdults}
            max={OCCUPANCY_LIMITS.maxAdults}
            onChange={(adults) => updateRoom(index, { adults })}
          />
          <Stepper
            label="Children"
            value={room.childAges.length}
            min={0}
            max={OCCUPANCY_LIMITS.maxChildrenPerRoom}
            onChange={(count) => setChildCount(index, count)}
          />

          {room.childAges.length > 0 && (
            <View style={styles.agesBlock}>
              {room.childAges.map((age, childIndex) => (
                <Stepper
                  key={childIndex}
                  label={`Child ${childIndex + 1} age`}
                  value={age}
                  min={OCCUPANCY_LIMITS.minAge}
                  max={OCCUPANCY_LIMITS.maxAge}
                  onChange={(v) => updateRoom(index, { childAges: room.childAges.map((a, i) => (i === childIndex ? v : a)) })}
                />
              ))}
            </View>
          )}
        </View>
      ))}

      <Pressable
        disabled={atMaxRooms}
        onPress={addRoom}
        style={[styles.addButton, atMaxRooms && styles.addButtonDisabled]}
        accessibilityRole="button"
        accessibilityLabel="Add room"
      >
        <Ionicons name="add" size={16} color={atMaxRooms ? colors.textMuted : colors.brand600} />
        <Text style={[styles.addButtonText, atMaxRooms && styles.addButtonTextDisabled]}>Add room</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  roomCard: { backgroundColor: colors.surfaceCard, borderRadius: radius.card, borderWidth: 1, borderColor: colors.borderSubtle, padding: spacing.md },
  roomHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  roomTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  roomTitle: { ...typography.bodyStrong, color: colors.textStrong },
  removeButton: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4, paddingHorizontal: spacing.xs },
  removeButtonText: { ...typography.caption, color: colors.danger600 },
  agesBlock: { marginTop: spacing.xs, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  addButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    height: 44, borderRadius: radius.control, borderWidth: 1, borderColor: colors.borderSubtle, borderStyle: 'dashed',
  },
  addButtonDisabled: { opacity: 0.5 },
  addButtonText: { ...typography.bodyStrong, color: colors.brand600 },
  addButtonTextDisabled: { color: colors.textMuted },
});
