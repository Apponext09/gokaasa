import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen.js';
import SearchScreen from '../screens/SearchScreen.js';
import MyTripsScreen from '../screens/MyTripsScreen.js';
import WishlistScreen from '../screens/WishlistScreen.js';
import ProfileScreen from '../screens/ProfileScreen.js';
import { colors } from '../theme/colors.js';

const Tab = createBottomTabNavigator();

const ICONS = {
  Home: 'home',
  Search: 'search',
  MyTrips: 'briefcase',
  Wishlist: 'heart',
  Profile: 'person',
};

/** The five-tab shell every real screen lives inside. Browsing (Home/Search) never requires sign-in;
 * MyTrips/Wishlist/Profile each show their own "sign in to continue" prompt when there's no session. */
export function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.brand600,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surfaceCard, borderTopColor: colors.borderSubtle, height: 58, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons name={focused ? ICONS[route.name] : `${ICONS[route.name]}-outline`} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="MyTrips" component={MyTripsScreen} options={{ title: 'My Trips' }} />
      <Tab.Screen name="Wishlist" component={WishlistScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
