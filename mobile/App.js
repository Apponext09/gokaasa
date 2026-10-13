import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext.js';
import { WishlistProvider } from './src/context/WishlistContext.js';
import { RootNavigator } from './src/navigation/RootNavigator.js';
import { LoadingView } from './src/components/LoadingView.js';

function Gate() {
  const { isLoading } = useAuth();
  // A brief, one-time splash while the cached session (if any) is restored/validated -- avoids a visible
  // flash where a tab first renders "signed out" and then flips to "signed in" a moment later.
  if (isLoading) return <LoadingView label="Loading Gokaasa…" />;
  return <RootNavigator />;
}

/**
 * SafeAreaProvider must wrap the ENTIRE app -- every screen's ScreenContainer (SafeAreaView) and every
 * component that reads useSafeAreaInsets() directly (the Booking Assistant's header, composer, and
 * launcher) depend on it. It was missing here before: ScreenContainer's SafeAreaView degrades quietly
 * without a provider (no padding, no crash), which is why its absence went unnoticed until the assistant
 * added the first direct useSafeAreaInsets() calls in this app -- that hook throws "No safe area value
 * available" outright when there is no provider, which is the exact runtime error this fixes. Placed as
 * the outermost wrapper (standard React Navigation guidance), with no native dependency or measurement
 * needed beyond what the package already provides -- this is config, not new business logic.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <WishlistProvider>
          <Gate />
          <StatusBar style="dark" />
        </WishlistProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
