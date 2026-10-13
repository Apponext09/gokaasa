import { useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors.js';
import { shadow } from '../../theme/spacing.js';

/**
 * Screens where the floating launcher is hidden: the chat itself (no point launching it from inside
 * itself), the auth flow (signing in/up needs full attention and the assistant needs no account), and the
 * three screens where a real payment or a time-boxed hold is in progress -- exactly the "critical booking
 * actions" the launcher must never cover or distract from. Exported standalone (no component, no
 * navigation) so it is directly unit-testable -- see tests/unit/AssistantLauncher.test.js.
 */
const HIDDEN_ROUTES = new Set(['Assistant', 'Auth', 'Login', 'Register', 'ForgotPassword', 'RoomSelection', 'Booking', 'Payment', 'BookingConfirmation']);

export function shouldShowAssistantLauncher(routeName) {
  if (!routeName) return false;
  return !HIDDEN_ROUTES.has(routeName);
}

/**
 * The default 72px clearance was tuned for the bottom TAB BAR (MainTabNavigator's tabBarStyle: height 58
 * + 6 top padding) that sits under the launcher on Home/Search/MyTrips/Wishlist/Profile. HotelDetails has
 * no tab bar -- it has its OWN sticky bottom CTA bar instead (HotelDetailsScreen.js's `footer`: a full-
 * width "See available rooms" button, ~48px tall plus spacing.lg padding top and bottom plus a 1px border,
 * roughly 81px). Using the tab-bar clearance there let the floating launcher sit on top of/immediately
 * beside that real booking CTA -- a confirmed, reproducible instance of exactly the "launcher must never
 * cover or distract from a critical booking action" rule this component already states, just missed for
 * this one screen because it has no tab bar to visually suggest the clash. Any future screen that adds its
 * own sticky bottom bar while still showing the launcher should be added here too.
 */
const ROUTES_WITH_STICKY_FOOTER_CLEARANCE = { HotelDetails: 96 };
const DEFAULT_CLEARANCE = 72;

/** Pure, so the exact offset is directly unit-testable without mounting a component or a real
 * SafeAreaProvider -- see tests/unit/AssistantLauncher.test.js. */
export function launcherBottomOffset(routeName, insetsBottom = 0) {
  const clearance = ROUTES_WITH_STICKY_FOOTER_CLEARANCE[routeName] ?? DEFAULT_CLEARANCE;
  return insetsBottom + clearance;
}

/** A global floating action button, rendered once above the whole navigator (see RootNavigator.js) so it
 * never needs to be added screen-by-screen. `onPress` navigates via the navigation container ref directly
 * (this component is not itself a route, so the `useNavigation` hook is not available to it). `routeName`
 * lets it clear a screen's own sticky bottom bar, if that screen has one (see launcherBottomOffset above). */
export function AssistantLauncher({ onPress, routeName }) {
  const insets = useSafeAreaInsets();
  const scale = useRef(new Animated.Value(1)).current;
  const animateTo = (value) => Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 0 }).start();

  return (
    <Animated.View style={[styles.wrap, { bottom: launcherBottomOffset(routeName, insets.bottom), transform: [{ scale }] }]} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        onPressIn={() => animateTo(0.94)}
        onPressOut={() => animateTo(1)}
        style={[styles.button, shadow.floating]}
        accessibilityRole="button"
        accessibilityLabel="Open the Gokaasa Booking Assistant"
      >
        <Ionicons name="sparkles" size={22} color={colors.white} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 16, zIndex: 50 },
  button: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand700, alignItems: 'center', justifyContent: 'center' },
});
