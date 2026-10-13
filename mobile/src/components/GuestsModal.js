import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton } from './AppButton.js';
import { Stepper } from './Stepper.js';
import { OCCUPANCY_LIMITS } from '../constants/booking.js';
import { colors } from '../theme/colors.js';
import { radius, spacing, typography } from '../theme/spacing.js';

/** Shared adults/children-per-room picker, used by both HomeScreen's search card and SearchScreen. */
export function GuestsModal({ visible, room, onChange, onClose }) {
  const [draft, setDraft] = useState(room);
  useEffect(() => {
    if (visible) setDraft(room);
  }, [visible, room]);

  const childCount = draft.childAges.length;
  const setChildCount = (n) => {
    const ages = [...draft.childAges];
    while (ages.length < n) ages.push(10);
    while (ages.length > n) ages.pop();
    setDraft({ ...draft, childAges: ages });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation?.()}>
          <Text style={styles.sheetTitle}>Guests & rooms</Text>
          <Stepper label="Adults" value={draft.adults} min={OCCUPANCY_LIMITS.minAdults} max={OCCUPANCY_LIMITS.maxAdults} onChange={(v) => setDraft({ ...draft, adults: v })} />
          <Stepper label="Children" value={childCount} min={0} max={OCCUPANCY_LIMITS.maxChildrenPerRoom} onChange={setChildCount} />
          {draft.childAges.map((age, i) => (
            <Stepper
              key={i}
              label={`Child ${i + 1} age`}
              value={age}
              min={OCCUPANCY_LIMITS.minAge}
              max={OCCUPANCY_LIMITS.maxAge}
              onChange={(v) => {
                const ages = [...draft.childAges];
                ages[i] = v;
                setDraft({ ...draft, childAges: ages });
              }}
            />
          ))}
          <AppButton title="Apply" onPress={() => { onChange(draft); onClose(); }} style={{ marginTop: spacing.md }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(10,23,38,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surfaceCard, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: spacing.xxl, maxHeight: '85%' },
  sheetTitle: { ...typography.h1, color: colors.textStrong, marginBottom: spacing.sm },
});
