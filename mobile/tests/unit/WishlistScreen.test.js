import { render, screen } from '@testing-library/react-native';
import WishlistScreen from '../../src/screens/WishlistScreen.js';

let mockAuthState = { isAuthenticated: true };
let mockWishlistState = { items: [], status: 'ready', refresh: jest.fn(), isWishlisted: () => false, toggle: jest.fn() };

jest.mock('../../src/context/AuthContext.js', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('../../src/context/WishlistContext.js', () => ({
  useWishlist: () => mockWishlistState,
}));

jest.mock('../../src/context/BookingSearchContext.js', () => ({
  useBookingSearch: () => ({
    checkIn: '2026-11-21',
    checkOut: '2026-11-22',
    rooms: [{ adults: 2, childAges: [] }],
  }),
}));

describe('WishlistScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders "My Wishlist" title when user has saved hotels', async () => {
    mockAuthState = { isAuthenticated: true };
    mockWishlistState = {
      items: [
        {
          id: 1,
          name: 'The Taj Mahal Palace, Mumbai',
          slug: 'taj-mahal-palace-mumbai',
          city: 'Mumbai',
          area: 'Colaba',
          starRating: 5,
        },
      ],
      status: 'ready',
      refresh: jest.fn(),
      isWishlisted: () => false,
      toggle: jest.fn(),
    };

    await render(<WishlistScreen navigation={{ navigate: jest.fn() }} />);
    expect(screen.getByText('My Wishlist')).toBeTruthy();
    expect(screen.getByText('1 saved stay')).toBeTruthy();
  });

  test('renders "My Wishlist" title when wishlist is empty', async () => {
    mockAuthState = { isAuthenticated: true };
    mockWishlistState = { items: [], status: 'ready', refresh: jest.fn() };

    await render(<WishlistScreen navigation={{ navigate: jest.fn() }} />);
    expect(screen.getByText('My Wishlist')).toBeTruthy();
    expect(screen.getByText('Your wishlist is empty')).toBeTruthy();
  });

  test('renders "My Wishlist" title when user is signed out', async () => {
    mockAuthState = { isAuthenticated: false };
    mockWishlistState = { items: [], status: 'ready', refresh: jest.fn() };

    await render(<WishlistScreen navigation={{ navigate: jest.fn() }} />);
    expect(screen.getByText('My Wishlist')).toBeTruthy();
    expect(screen.getByText('Sign in to save hotels')).toBeTruthy();
  });
});
