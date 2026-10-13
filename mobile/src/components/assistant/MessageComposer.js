import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors.js';
import { radius, spacing, typography } from '../../theme/spacing.js';

/**
 * The bottom-pinned text composer. There is no voice/microphone input here -- the website's chatbot uses
 * the browser's SpeechRecognition API, which has no equivalent built into Expo Go without adding a native
 * module that needs a custom dev build (see mobile/README.md's "Known limitations" and the assistant
 * feature's final report). Typed input is the one, fully working way to talk to this assistant.
 */
export function MessageComposer({ value, onChange, onSubmit, placeholder, submitting, error, note, candidates, onPickCandidate }) {
  const insets = useSafeAreaInsets();
  const canSend = value.trim().length > 0 && !submitting;

  return (
    <View style={[styles.container, { paddingBottom: Math.max(spacing.md, insets.bottom) }]}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}
      {candidates?.length > 1 && (
        <View style={styles.candidateRow}>
          {candidates.map((c) => (
            <Pressable key={`${c.type}-${c.destination}`} style={styles.candidateChip} onPress={() => onPickCandidate(c)}>
              <Text style={styles.candidateText}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.row}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          multiline
          maxLength={500}
          accessibilityLabel="Message Gokaasa Booking Assistant"
          onSubmitEditing={onSubmit}
          blurOnSubmit={false}
        />
        <Pressable
          onPress={onSubmit}
          disabled={!canSend}
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          <Ionicons name="send" size={17} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderTopWidth: 1, borderTopColor: colors.borderSubtle, backgroundColor: colors.surfaceCard, paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.xs },
  error: { ...typography.caption, color: colors.danger600 },
  note: { ...typography.caption, color: colors.brand700 },
  candidateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  candidateChip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderSubtle, paddingHorizontal: spacing.md, paddingVertical: 6 },
  candidateText: { ...typography.caption, color: colors.textBody, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1, minHeight: 44, maxHeight: 110, borderRadius: radius.control, borderWidth: 1, borderColor: colors.borderSubtle,
    backgroundColor: colors.surfacePage, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...typography.body, color: colors.textStrong,
  },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand600, alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { backgroundColor: colors.surfaceMuted },
});
