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

  test('with no destination chosen, tapping "Search Hotels" shows a validation error and never calls the API', async () => {
    const route = { params: {} };
    const navigation = { navigate: jest.fn() };
    await render(<SearchScreen route={route} navigation={navigation} />);

    fireEvent.press(screen.getByText('Search Hotels'));

    await waitFor(() => expect(screen.queryByText(/choose a destination/i)).toBeTruthy());
    expect(hotelsApi.search).not.toHaveBeenCalled();
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

describe('SearchScreen quick filters (one-tap shortcuts to the real backend filters)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('tapping "Free cancellation" re-searches with the real freeCancellation filter applied, and tapping it again clears it', async () => {
    hotelsApi.search.mockResolvedValue({ items: [], total: 0 });
    const route = { params: { destination: 'mumbai', label: 'Mumbai', checkIn: '2026-11-12', checkOut: '2026-11-14', occupancy: [{ adults: 2, childAges: [] }] } };
    await render(<SearchScreen route={route} navigation={{ navigate: jest.fn() }} />);
    await waitFor(() => expect(hotelsApi.search).toHaveBeenCalledTimes(1));

    fireEvent.press(screen.getByText('Free cancellation'));
    await waitFor(() => expect(hotelsApi.search).toHaveBeenCalledTimes(2));
    expect(hotelsApi.search).toHaveBeenLastCalledWith(expect.objectContaining({ freeCancellation: 'true' }), expect.anything());

    fireEvent.press(screen.getByText('Free cancellation'));
    await waitFor(() => expect(hotelsApi.search).toHaveBeenCalledTimes(3));
    expect(hotelsApi.search).toHaveBeenLastCalledWith(expect.objectContaining({ freeCancellation: undefined }), expect.anything());
  });

  test('tapping "4★ guest rating+" sends the real guestRating threshold the backend\'s hotelSearchQuery validator actually supports', async () => {
    hotelsApi.search.mockResolvedValue({ items: [], total: 0 });
    const route = { params: { destination: 'mumbai', label: 'Mumbai', checkIn: '2026-11-12', checkOut: '2026-11-14', occupancy: [{ adults: 2, childAges: [] }] } };
    await render(<SearchScreen route={route} navigation={{ navigate: jest.fn() }} />);
    await waitFor(() => expect(hotelsApi.search).toHaveBeenCalledTimes(1));

    fireEvent.press(screen.getByText('4★ guest rating+'));
    await waitFor(() => expect(hotelsApi.search).toHaveBeenCalledTimes(2));
    expect(hotelsApi.search).toHaveBeenLastCalledWith(expect.objectContaining({ guestRating: 4 }), expect.anything());
  });

  test('tapping "Resorts" and "Swimming pool" together applies the real propertyTypes and amenities filters at once', async () => {
    hotelsApi.search.mockResolvedValue({ items: [], total: 0 });
    const route = { params: { destination: 'mumbai', label: 'Mumbai', checkIn: '2026-11-12', checkOut: '2026-11-14', occupancy: [{ adults: 2, childAges: [] }] } };
    await render(<SearchScreen route={route} navigation={{ navigate: jest.fn() }} />);
    await waitFor(() => expect(hotelsApi.search).toHaveBeenCalledTimes(1));

    fireEvent.press(screen.getByText('Resorts'));
    await waitFor(() => expect(hotelsApi.search).toHaveBeenCalledTimes(2));
    fireEvent.press(screen.getByText('Swimming pool'));
    await waitFor(() => expect(hotelsApi.search).toHaveBeenCalledTimes(3));

    expect(hotelsApi.search).toHaveBeenLastCalledWith(expect.objectContaining({ propertyTypes: 'RESORT', amenities: 'POOL' }), expect.anything());
  });
});
