import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BookingSearchProvider, useBookingSearch, DEFAULT_SEARCH_STATE } from '../../src/context/BookingSearchContext.js';

describe('BookingSearchContext', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  test('initializes with destination as null and future dates', async () => {
    const { result } = await renderHook(() => useBookingSearch(), { wrapper: BookingSearchProvider });

    await waitFor(() => expect(result.current.destination).toBeNull());
    expect(result.current.checkIn).toBeTruthy();
    expect(result.current.checkOut).toBeTruthy();
    expect(result.current.rooms).toHaveLength(1);
  });

  test('does not restore legacy destination from storage, keeping destination null for all properties', async () => {
    await AsyncStorage.setItem(
      '@gokaasa_booking_search',
      JSON.stringify({
        destination: { destination: 'navi-mumbai', label: 'Navi Mumbai' },
        checkIn: '2026-12-10',
        checkOut: '2026-12-12',
        rooms: [{ adults: 2, childAges: [] }],
      })
    );

    const { result } = await renderHook(() => useBookingSearch(), { wrapper: BookingSearchProvider });

    await waitFor(() => expect(result.current.destination).toBeNull());
    // Dates are preserved from storage
    expect(result.current.checkIn).toBe('2026-12-10');
    expect(result.current.checkOut).toBe('2026-12-12');
  });

  test('setDestination updates in-memory destination without persisting destination across sessions', async () => {
    const { result } = await renderHook(() => useBookingSearch(), { wrapper: BookingSearchProvider });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    await act(async () => {
      result.current.setDestination({ destination: 'ahilyanagar', label: 'Ahilyanagar' });
    });

    expect(result.current.destination).toEqual({ destination: 'ahilyanagar', label: 'Ahilyanagar' });

    // Set dates triggers persistence
    await act(async () => {
      result.current.setDates('2026-12-15', '2026-12-18');
    });

    const raw = await AsyncStorage.getItem('@gokaasa_booking_search');
    const stored = JSON.parse(raw);
    expect(stored.destination).toBeNull();
    expect(stored.checkIn).toBe('2026-12-15');
    expect(stored.checkOut).toBe('2026-12-18');
  });
});
