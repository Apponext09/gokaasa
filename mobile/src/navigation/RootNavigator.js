import { useState } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainTabNavigator } from './MainTabNavigator.js';
import { AuthNavigator } from './AuthNavigator.js';
import HotelDetailsScreen from '../screens/HotelDetailsScreen.js';
import RoomSelectionScreen from '../screens/RoomSelectionScreen.js';
import BookingScreen from '../screens/BookingScreen.js';
import PaymentScreen from '../screens/PaymentScreen.js';
import BookingConfirmationScreen from '../screens/BookingConfirmationScreen.js';
import BookingDetailsScreen from '../screens/BookingDetailsScreen.js';
import EditProfileScreen from '../screens/EditProfileScreen.js';
import NotificationsScreen from '../screens/NotificationsScreen.js';
import AssistantScreen from '../screens/AssistantScreen.js';
import { AssistantLauncher, shouldShowAssistantLauncher } from '../components/assistant/AssistantLauncher.js';
import { colors } from '../theme/colors.js';

const Stack = createNativeStackNavigator();

const headerOptions = {
  headerStyle: { backgroundColor: colors.surfaceCard },
  headerTintColor: colors.textStrong,
  headerShadowVisible: false,
};

/**
 * One root stack: the tab shell plus every "flow" screen that's reached by pushing on top of it
 * (hotel -> room -> guest details -> payment -> confirmation, My Trips -> booking details, Profile ->
 * edit profile / notifications), the Auth group, and the Assistant (Booking chat), reachable from any
 * screen that needs a session or the chat respectively.
 *
 * The Assistant is a modal-presentation stack screen rather than a hand-rolled overlay: pushing it keeps
 * whatever screen was underneath fully mounted with its state untouched (search filters, selected hotel,
 * scroll position, in-flight requests), and closing it (the header's close button, the hardware back
 * button, or an iOS swipe-down -- all handled by the navigator for free) simply pops back to exactly that
 * screen. The floating launcher is rendered once here, as a sibling of the Stack.Navigator, and navigates
 * via a direct container ref (see AssistantLauncher.js) since it is not itself a screen component.
 */
export function RootNavigator() {
  const navigationRef = useNavigationContainerRef();
  const [routeName, setRouteName] = useState(undefined);

  const syncRouteName = () => setRouteName(navigationRef.getCurrentRoute()?.name);

  return (
    <NavigationContainer ref={navigationRef} onReady={syncRouteName} onStateChange={syncRouteName}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={MainTabNavigator} />
        <Stack.Screen name="Auth" component={AuthNavigator} />
        <Stack.Screen name="HotelDetails" component={HotelDetailsScreen} options={{ ...headerOptions, headerShown: true, title: '' }} />
        <Stack.Screen name="RoomSelection" component={RoomSelectionScreen} options={{ ...headerOptions, headerShown: true, title: 'Select a room' }} />
        <Stack.Screen name="Booking" component={BookingScreen} options={{ ...headerOptions, headerShown: true, title: 'Guest details' }} />
        <Stack.Screen name="Payment" component={PaymentScreen} options={{ ...headerOptions, headerShown: true, title: 'Payment' }} />
        <Stack.Screen name="BookingConfirmation" component={BookingConfirmationScreen} options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="BookingDetails" component={BookingDetailsScreen} options={{ ...headerOptions, headerShown: true, title: 'Trip details' }} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ ...headerOptions, headerShown: true, title: 'Edit profile' }} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ ...headerOptions, headerShown: true, title: 'Notifications' }} />
        <Stack.Screen name="Assistant" component={AssistantScreen} options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }} />
      </Stack.Navigator>
      {shouldShowAssistantLauncher(routeName) && <AssistantLauncher routeName={routeName} onPress={() => navigationRef.navigate('Assistant')} />}
    </NavigationContainer>
  );
}
