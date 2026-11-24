import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { bookingsApi } from '../api/bookingsApi.js';
import { FadeSlideIn } from './FadeSlideIn.js';
import { formatCountdown } from '../utils/format.js';
import { colors } from '../theme/colors.js';
import { radius, shadow, spacing, typography } from '../theme/spacing.js';

/**
 * ActiveHoldCard — single-line, ultra-compact floating bar for mobile HomeScreen.
 * Matches web's slim one-line design:
 *   [ 🛏️ Deluxe Room · ⏱️ 08:45 ]  [ Resume ] [ Cancel ]
 */
export function ActiveHoldCard({ navigation }) {
  const [hold, setHold]             = useState(null);
  const [status, setStatus]         = useState('loading');
  const [cancelling, setCancelling] = useState(false);
  const mountedRef = useRef(true);

  // Live seconds for the inline countdown
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchActiveHold = useCallback(() => {
    return bookingsApi
      .activeHold()
      .then((h) => {
        if (!mountedRef.current) return;
        setHold(h ?? null);
        setStatus('ready');
        if (h?.expiresAt) {
          const sec = Math.max(0, Math.ceil((new Date(h.expiresAt).getTime() - Date.now()) / 1000));
          setSeconds(sec);
        }
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setHold(null);
        setStatus('ready');
      });
  }, []);

  useEffect(() => {
    fetchActiveHold();
  }, [fetchActiveHold]);

  // Foreground refetch
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') fetchActiveHold();
    });
    return () => sub.remove();
  }, [fetchActiveHold]);

  // 1-second countdown tick
  useEffect(() => {
    if (!hold || seconds <= 0) return;
    const interval = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          fetchActiveHold();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [hold, seconds, fetchActiveHold]);

  const handleResume = () => {
    if (!hold) return;
    navigation.navigate('Booking', {
      holdId:    hold.id,
      hotelName: hold.quote?.hotel?.name ?? '',
      roomName:  hold.quote?.room?.name  ?? '',
      planName:  hold.quote?.ratePlan?.name ?? 'Standard Rate',
    });
  };

  const handleCancel = () => {
    Alert.alert(
      'Release room hold?',
      'The room will be returned to availability immediately.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Release',
          style: 'destructive',
          onPress: async () => {
            if (!hold) return;
            setCancelling(true);
            try {
              await bookingsApi.release(hold.id);
              if (mountedRef.current) setHold(null);
            } catch (err) {
              if (err?.response?.status === 404 || err?.response?.status === 409) {
                if (mountedRef.current) setHold(null);
              }
            } finally {
              if (mountedRef.current) setCancelling(false);
            }
          },
        },
      ],
    );
  };

  if (status === 'loading' || !hold) return null;

  const roomName  = hold.quote?.room?.name || 'Room';
  const urgent    = seconds < 120;

  return (
    <FadeSlideIn style={[styles.singleLineBar, shadow.floating]}>
      {/* Left: Icon, Room Name, and Compact Timer */}
      <View style={styles.leftCol}>
        <View style={styles.iconWrap}>
          <Ionicons name="bed-outline" size={14} color={colors.brand600} />
        </View>

        <Text style={styles.roomName} numberOfLines={1}>
          {roomName}
        </Text>

        <View style={[styles.timerBadge, urgent && styles.timerBadgeUrgent]}>
          <Ionicons
            name="time-outline"
            size={11}
            color={urgent ? colors.danger600 : colors.warning600}
          />
          <Text style={[styles.timerText, urgent && styles.timerTextUrgent]}>
            {formatCountdown(seconds)}
          </Text>
        </View>
      </View>

      {/* Right: Resume & Cancel Buttons in the same line */}
      <View style={styles.rightActions}>
        <Pressable
          style={styles.resumeBtn}
          onPress={handleResume}
          accessibilityRole="button"
          accessibilityLabel="Resume booking"
        >
          <Text style={styles.resumeBtnText}>Resume</Text>
        </Pressable>

        <Pressable
          style={styles.cancelBtn}
          onPress={handleCancel}
          disabled={cancelling}
          accessibilityRole="button"
          accessibilityLabel="Cancel hold"
        >
          <Text style={styles.cancelBtnText}>{cancelling ? '…' : 'Cancel'}</Text>
        </Pressable>
      </View>
    </FadeSlideIn>
  );
}

const styles = StyleSheet.create({
  singleLineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.lg,
    marginTop: 10,
    marginBottom: -8, // Tightens the gap so there is no awkward empty space below the hold card
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.brand200 ?? '#bfdbfe',
    gap: spacing.xs,
  },
  leftCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.brand50 ?? '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomName: {
    ...typography.captionStrong,
    color: colors.textStrong,
    fontSize: 12,
    flexShrink: 1,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.warning50 ?? '#fffbeb',
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  timerBadgeUrgent: {
    backgroundColor: colors.danger50 ?? '#fef2f2',
  },
  timerText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.warning600,
    fontVariant: ['tabular-nums'],
  },
  timerTextUrgent: {
    color: colors.danger600,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  resumeBtn: {
    backgroundColor: colors.brand600,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeBtnText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: colors.danger600,
    fontSize: 11,
    fontWeight: '600',
  },
});
