import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import SearchScreen from '../../src/screens/SearchScreen.js';

jest.mock('../../src/api/hotelsApi.js', () => ({
  hotelsApi: { search: jest.fn(), suggestDestinations: jest.fn(), amenities: jest.fn(() => Promise.resolve([])) },
}));
jest.mock('../../src/context/AuthContext.js', () => ({ useAuth: () => ({ isAuthenticated: false }) }));
jest.mock('../../src/context/WishlistContext.js', () => ({ useWishlist: () => ({ isWishlisted: () => false, toggle: jest.fn() }) }));

import { hotelsApi } from '../../src/api/hotelsApi.js';

/**
 * Regression tests for the actual reported "hotel search is not working" bug. Verified live against
 * production (see session notes) that the backend's /hotels/search endpoint itself works correctly with
 * these exact params -- the real bug was entirely client-side: there was no explicit "Search Hotels"
 * commit action at all, and no validation before calling the API.
 */
describe('SearchScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  test('with no destination chosen, all hotels are loaded by default and tapping "Search Hotels" searches all hotels', async () => {
    const body = { items: [{ id: 1, name: 'The Taj Mahal Palace, Mumbai', slug: 'taj-mahal-palace-mumbai', city: 'Mumbai', area: 'Colaba' }], total: 1 };
    hotelsApi.search.mockResolvedValue(body);

    const route = { params: {} };
    const navigation = { navigate: jest.fn() };
    await render(<SearchScreen route={route} navigation={navigation} />);

    await waitFor(() => expect(hotelsApi.search).toHaveBeenCalled());
    expect(hotelsApi.search).toHaveBeenCalledWith(
      expect.objectContaining({ destination: undefined }),
      expect.objectContaining({ signal: expect.anything() }),
    );

    fireEvent.press(screen.getByText('Search Hotels'));
    await waitFor(() => expect(hotelsApi.search).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('The Taj Mahal Palace, Mumbai')).toBeTruthy());
  });

  test('arriving with an already-chosen destination (e.g. a Home destination-card tap) searches immediately and renders real results', async () => {
    const body = { items: [{ id: 1, name: 'The Taj Mahal Palace, Mumbai', slug: 'taj-mahal-palace-mumbai', city: 'Mumbai', area: 'Colaba' }], total: 1 };
    hotelsApi.search.mockResolvedValue(body);

    const route = { params: { destination: 'mumbai', label: 'Mumbai', checkIn: '2026-11-12', checkOut: '2026-11-14', occupancy: [{ adults: 2, childAges: [] }] } };
    const navigation = { navigate: jest.fn() };
    await render(<SearchScreen route={route} navigation={navigation} />);

    await waitFor(() => expect(hotelsApi.search).toHaveBeenCalled());
    expect(hotelsApi.search).toHaveBeenCalledWith(
      expect.objectContaining({ destination: 'mumbai', checkIn: '2026-11-12', checkOut: '2026-11-14', occ: '2' }),
      expect.objectContaining({ signal: expect.anything() }),
    );
    await waitFor(() => expect(screen.queryByText('The Taj Mahal Palace, Mumbai')).toBeTruthy());
  });

  test('a real search API error shows a readable message with a retry action, not a crash', async () => {
    hotelsApi.search.mockRejectedValue({ status: 500, code: 'ERROR', message: 'Something went wrong. Please try again.', fieldErrors: {} });
    const route = { params: { destination: 'mumbai', label: 'Mumbai' } };
    const navigation = { navigate: jest.fn() };
    await render(<SearchScreen route={route} navigation={navigation} />);

    await waitFor(() => expect(screen.queryByText('Something went wrong. Please try again.')).toBeTruthy());
    expect(screen.queryByText('Try again')).toBeTruthy();
  });
});

describe('SearchScreen filters modal', () => {
  beforeEach(() => jest.clearAllMocks());

  test('opening Filters modal and applying "Free cancellation only" re-searches with freeCancellation: "true"', async () => {
    hotelsApi.search.mockResolvedValue({ items: [], total: 0 });
    const route = { params: { destination: 'mumbai', label: 'Mumbai', checkIn: '2026-11-12', checkOut: '2026-11-14', occupancy: [{ adults: 2, childAges: [] }] } };
    await render(<SearchScreen route={route} navigation={{ navigate: jest.fn() }} />);
    await waitFor(() => expect(hotelsApi.search).toHaveBeenCalledTimes(1));

    fireEvent.press(screen.getByText('Filters'));
    const freeCancel = await screen.findByTestId('filter-free-cancellation');
    fireEvent.press(freeCancel);
    await waitFor(() => expect(screen.getByTestId('filter-free-cancellation').props.accessibilityState.checked).toBe(true));

    fireEvent.press(screen.getByText('Apply filters'));

    await waitFor(() => expect(hotelsApi.search).toHaveBeenCalledTimes(2));
    expect(hotelsApi.search).toHaveBeenLastCalledWith(expect.objectContaining({ freeCancellation: 'true' }), expect.anything());
  });

  test('opening Filters modal and selecting 4+ guest rating applies guestRating: 4', async () => {
    hotelsApi.search.mockResolvedValue({ items: [], total: 0 });
    const route = { params: { destination: 'mumbai', label: 'Mumbai', checkIn: '2026-11-12', checkOut: '2026-11-14', occupancy: [{ adults: 2, childAges: [] }] } };
    await render(<SearchScreen route={route} navigation={{ navigate: jest.fn() }} />);
    await waitFor(() => expect(hotelsApi.search).toHaveBeenCalledTimes(1));

    fireEvent.press(screen.getByText('Filters'));
    const fourPlus = await screen.findByLabelText('Guest rating 4+');
    fireEvent.press(fourPlus);
    await waitFor(() => expect(screen.getByLabelText('Guest rating 4+').props.accessibilityState.selected).toBe(true));

    fireEvent.press(screen.getByText('Apply filters'));

    await waitFor(() => expect(hotelsApi.search).toHaveBeenCalledTimes(2));
    expect(hotelsApi.search).toHaveBeenLastCalledWith(expect.objectContaining({ guestRating: 4 }), expect.anything());
  });
});
