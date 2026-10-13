import { screen, waitFor, fireEvent } from '@testing-library/react-native';
import HomeScreen from '../../src/screens/HomeScreen.js';
import { renderWithSafeArea } from '../testUtils/renderWithSafeArea.js';

jest.mock('../../src/api/hotelsApi.js', () => ({
  hotelsApi: {
    popularDestinations: jest.fn(() => Promise.resolve([{ destination: 'goa', label: 'Goa', hotelCount: 12 }])),
    handpickedHotels: jest.fn(() => Promise.resolve({ items: [] })),
    suggestDestinations: jest.fn(() => Promise.resolve([])),
  },
}));
jest.mock('../../src/api/notificationsApi.js', () => ({
  notificationsApi: { unreadCount: jest.fn(() => Promise.resolve(3)) },
}));
jest.mock('../../src/context/AuthContext.js', () => ({ useAuth: () => ({ user: { firstName: 'Asha' }, isAuthenticated: true }) }));
jest.mock('../../src/context/WishlistContext.js', () => ({ useWishlist: () => ({ isWishlisted: () => false, toggle: jest.fn() }) }));

import { notificationsApi } from '../../src/api/notificationsApi.js';

/**
 * Smoke test for the home screen, previously untested. Also the regression test for the notification bell
 * added here: useFocusEffect (unlike a plain useEffect) needs a real navigation focus context to not throw
 * "Couldn't find a navigation object" -- @testing-library/react-native's own render() wraps screens in one
 * automatically, which is exactly what this test confirms actually holds for this screen.
 */
describe('HomeScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  test('renders the real popular destinations and an unread-notification badge sourced from the real API, without crashing', async () => {
    const navigation = { navigate: jest.fn() };
    await renderWithSafeArea(<HomeScreen navigation={navigation} />);

    await waitFor(() => expect(screen.getByText('Goa')).toBeTruthy());
    await waitFor(() => expect(notificationsApi.unreadCount).toHaveBeenCalled());
    expect(await screen.findByText('3')).toBeTruthy();
  });

  test('tapping the notification bell navigates to the Notifications screen', async () => {
    const navigation = { navigate: jest.fn() };
    await renderWithSafeArea(<HomeScreen navigation={navigation} />);

    const bell = await screen.findByLabelText(/Notifications/);
    fireEvent.press(bell);
    expect(navigation.navigate).toHaveBeenCalledWith('Notifications');
  });
});
