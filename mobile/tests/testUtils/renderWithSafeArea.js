import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render as rtlRender } from '@testing-library/react-native';

// Components under test use useSafeAreaInsets() directly (AssistantHeader, MessageComposer,
// AssistantLauncher), which throws "No safe area value available" without a real ancestor provider.
// `initialMetrics` lets the real SafeAreaProvider resolve synchronously in a test (no native onLayout
// measurement pass needed) -- this is the library's own documented way to use it under Jest, so it also
// keeps every other consumer of the real module (e.g. @react-navigation/elements' internal
// SafeAreaProviderCompat, exercised by AssistantModalNavigation.test.js) working exactly as it does in
// the real app, instead of a hand-rolled module mock that has to keep re-guessing that internal surface.
const ZERO_METRICS = { frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } };

export function renderWithSafeArea(ui) {
  return rtlRender(<SafeAreaProvider initialMetrics={ZERO_METRICS}>{ui}</SafeAreaProvider>);
}
