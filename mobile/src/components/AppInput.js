import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors.js';
import { radius, spacing, typography } from '../theme/spacing.js';

/** One consistent text field: label, error state, focus ring, and a show/hide toggle whenever
 * `secureTextEntry` is passed (password fields). Forwards any other TextInput prop. */
export function AppInput({ label, error, containerStyle, secureTextEntry, ...inputProps }) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const isPassword = Boolean(secureTextEntry);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputWrap}>
        <TextInput
          placeholderTextColor={colors.textMuted}
          secureTextEntry={isPassword && !revealed}
          style={[
            styles.input,
            isPassword && styles.inputWithIcon,
            focused && styles.inputFocused,
            error && styles.inputError,
          ]}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          {...inputProps}
        />
        {isPassword && (
          <Pressable
            style={styles.revealButton}
            onPress={() => setRevealed((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
          >
            <Ionicons name={revealed ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { ...typography.caption, fontWeight: '600', color: colors.textStrong },
  inputWrap: { position: 'relative' },
  input: {
    height: 48,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
    color: colors.textStrong,
  },
  inputWithIcon: { paddingRight: spacing.xxxl },
  inputFocused: { borderColor: colors.brand500 },
  inputError: { borderColor: colors.danger600 },
  revealButton: { position: 'absolute', right: spacing.sm, top: 0, height: 48, width: 36, alignItems: 'center', justifyContent: 'center' },
  error: { ...typography.tiny, color: colors.danger600 },
});
