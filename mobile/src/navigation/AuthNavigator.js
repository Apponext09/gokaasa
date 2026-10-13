import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen.js';
import RegisterScreen from '../screens/RegisterScreen.js';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen.js';
import { colors } from '../theme/colors.js';

const Stack = createNativeStackNavigator();

/** Login / Register / Forgot password. Pushed as one group from anywhere in the app that needs a signed-
 * in user (booking, wishlist, my trips, profile) -- browsing stays open to guests, this is only asked for
 * when an action genuinely requires an account. */
export function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surfaceCard },
        headerTintColor: colors.textStrong,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign in' }} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create account' }} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Reset password' }} />
    </Stack.Navigator>
  );
}
