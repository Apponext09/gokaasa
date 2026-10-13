import { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

const VARIANTS = {
  primary: { bg: colors.brand600, bgPressed: colors.brand700, text: colors.white, border: 'transparent', elevation: shadow.subtle },
  secondary: { bg: colors.surfaceCard, bgPressed: colors.surfaceMuted, text: colors.textStrong, border: colors.borderSubtle },
  premium: { bg: colors.accent500, bgPressed: colors.accent600, text: colors.brand900, border: 'transparent', elevation: shadow.subtle },
  danger: { bg: colors.danger600, bgPressed: colors.danger700, text: colors.white, border: 'transparent' },
  ghost: { bg: 'transparent', bgPressed: colors.surfaceMuted, text: colors.textBody, border: 'transparent' },
};

const SIZES = {
  sm: { height: 36, paddingHorizontal: spacing.lg, fontSize: 13 },
  md: { height: 48, paddingHorizontal: spacing.xxl, fontSize: 15 },
  lg: { height: 56, paddingHorizontal: spacing.xxl, fontSize: 16 },
};

/** The one button component every screen uses -- consistent height, color, disabled/loading state, and
 * a small, subtle press-down scale (native Animated API, no extra dependency) so every tap feels tactile. */
export function AppButton({ title, onPress, variant = 'primary', size = 'md', disabled = false, loading = false, style, icon }) {
  const v = VARIANTS[variant] ?? VARIANTS.primary;
  const s = SIZES[size] ?? SIZES.md;
  const isDisabled = disabled || loading;
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value) => Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 0 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        onPress={isDisabled ? undefined : onPress}
        onPressIn={() => !isDisabled && animateTo(0.97)}
        onPressOut={() => animateTo(1)}
        style={({ pressed }) => [
          styles.base,
          v.elevation,
          {
            backgroundColor: isDisabled ? colors.surfaceMuted : pressed ? v.bgPressed : v.bg,
            borderColor: v.border,
            height: s.height,
            paddingHorizontal: s.paddingHorizontal,
            opacity: isDisabled ? 0.7 : 1,
          },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={variant === 'secondary' || variant === 'ghost' ? colors.brand600 : v.text} />
        ) : (
          <>
            {icon}
            <Text style={[styles.text, { color: isDisabled ? colors.textMuted : v.text, fontSize: s.fontSize }]} numberOfLines={1}>
              {title}
            </Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  text: {
    ...typography.bodyStrong,
  },
});
