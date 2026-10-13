import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

/**
 * A subtle, lightweight mount animation (fade + small upward slide) using React Native's built-in
 * Animated API -- no new dependency. Used for screen content, hotel cards, and section reveals so the
 * app feels considered rather than everything just snapping into place. `delay` lets a list stagger a
 * few of its first items without every screen reinventing the same timing code.
 */
export function FadeSlideIn({ children, delay = 0, style }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 280,
      delay,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, delay]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
