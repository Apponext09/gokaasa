import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors.js';
import { radius, spacing, typography } from '../../theme/spacing.js';

/** One assistant turn in the transcript -- plain text only (no markdown), long text wraps naturally
 * because Text always wraps inside a constrained-width bubble; nothing here can force horizontal scroll. */
export function AssistantBubble({ text }) {
  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Ionicons name="sparkles" size={14} color={colors.white} />
      </View>
      <View style={[styles.bubble, styles.assistantBubble]}>
        <Text style={styles.assistantText}>{text}</Text>
      </View>
    </View>
  );
}

export function UserBubble({ text }) {
  return (
    <View style={[styles.row, styles.rowEnd]}>
      <View style={[styles.bubble, styles.userBubble]}>
        <Text style={styles.userText}>{text}</Text>
      </View>
    </View>
  );
}

export function TypingIndicator() {
  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Ionicons name="sparkles" size={14} color={colors.white} />
      </View>
      <View style={[styles.bubble, styles.assistantBubble, styles.typingBubble]}>
        <View style={styles.dot} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginBottom: spacing.md, maxWidth: '100%' },
  rowEnd: { justifyContent: 'flex-end' },
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.brand700, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '82%', borderRadius: radius.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  assistantBubble: { backgroundColor: colors.surfaceMuted, borderBottomLeftRadius: 4 },
  assistantText: { ...typography.body, color: colors.textStrong },
  userBubble: { backgroundColor: colors.brand600, borderBottomRightRadius: 4 },
  userText: { ...typography.body, color: colors.white },
  typingBubble: { flexDirection: 'row', gap: 4, paddingVertical: spacing.md },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted, opacity: 0.6 },
});
