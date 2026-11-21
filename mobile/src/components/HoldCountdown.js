import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCountdown } from '../utils/format.js';
import { colors } from '../theme/colors.js';
import { radius, spacing, typography } from '../theme/spacing.js';
import { FadeSlideIn } from './FadeSlideIn.js';

/**
 * Isolated visual countdown for a room hold.
 * Keeping its own 1-second interval ensures the parent screen (e.g. BookingScreen)
 * does not re-render every second, which prevents UI/form resets and dialog flicker.
 */
export function HoldCountdown({ secondsRemaining = 0, expiresAt, onExpire }) {
  const getInitialSeconds = () => {
    if (expiresAt) {
      return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
    }
    return Math.max(0, secondsRemaining || 0);
  };

  const [seconds, setSeconds] = useState(getInitialSeconds);
  const firedRef = useRef(false);

  useEffect(() => {
    setSeconds(getInitialSeconds());
    firedRef.current = false;
  }, [secondsRemaining, expiresAt]);

  useEffect(() => {
    if (seconds <= 0) {
      if (!firedRef.current) {
        firedRef.current = true;
        onExpire?.();
      }
      return;
    }

    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (!firedRef.current) {
            firedRef.current = true;
            onExpire?.();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [seconds, onExpire]);

  const urgent = seconds < 120;

  return (
    <FadeSlideIn style={[styles.timerBanner, urgent && styles.timerBannerUrgent]}>
      <Ionicons
        name="time-outline"
        size={16}
        color={urgent ? colors.danger600 : colors.warning600}
      />
      <Text style={[styles.timerText, urgent && styles.timerTextUrgent]}>
        Room held for {formatCountdown(seconds)}
      </Text>
    </FadeSlideIn>
  );
}

const styles = StyleSheet.create({
  timerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warning50,
    borderRadius: radius.control,
    padding: spacing.md,
  },
  timerBannerUrgent: {
    backgroundColor: colors.danger50,
  },
  timerText: {
    ...typography.bodyStrong,
    color: colors.warning600,
  },
  timerTextUrgent: {
    color: colors.danger600,
  },
});
