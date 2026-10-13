import { screen } from '@testing-library/react-native';
import HomeScreen from '../../src/screens/HomeScreen.js';
import { renderWithSafeArea } from '../testUtils/renderWithSafeArea.js';

jest.mock('../../src/api/hotelsApi.js', () => ({
  hotelsApi: {
    popularDestinations: jest.fn(() => Promise.resolve([])),
    handpickedHotels: jest.fn(() => Promise.resolve({ items: [] })),
    suggestDestinations: jest.fn(() => Promise.resolve([])),
  },
}));
jest.mock('../../src/api/notificationsApi.js', () => ({ notificationsApi: { unreadCount: jest.fn() } }));
jest.mock('../../src/context/AuthContext.js', () => ({ useAuth: () => ({ user: null, isAuthenticated: false }) }));
jest.mock('../../src/context/WishlistContext.js', () => ({ useWishlist: () => ({ isWishlisted: () => false, toggle: jest.fn() }) }));

import { notificationsApi } from '../../src/api/notificationsApi.js';

describe('HomeScreen (guest, not signed in)', () => {
  test('shows no notification bell and never calls the authenticated unread-count endpoint', async () => {
    await renderWithSafeArea(<HomeScreen navigation={{ navigate: jest.fn() }} />);
    expect(screen.queryByLabelText(/Notifications/)).toBeNull();
    expect(notificationsApi.unreadCount).not.toHaveBeenCalled();
  });
});
