import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AssistantScreen from '../../src/screens/AssistantScreen.js';
import { renderWithSafeArea as render } from '../testUtils/renderWithSafeArea.js';

jest.mock('../../src/api/hotelsApi.js', () => ({
  hotelsApi: {
    search: jest.fn(),
    suggestDestinations: jest.fn(),
    popularDestinations: jest.fn(() => Promise.resolve([{ destination: 'goa', label: 'Goa', hotelCount: 12 }])),
  },
}));
jest.mock('../../src/api/assistantApi.js', () => ({
  assistantApi: { status: jest.fn(), extract: jest.fn() },
}));
jest.mock('../../src/context/AuthContext.js', () => ({ useAuth: () => ({ isAuthenticated: false }) }));
jest.mock('../../src/context/WishlistContext.js', () => ({ useWishlist: () => ({ isWishlisted: () => false, toggle: jest.fn() }) }));

import { hotelsApi } from '../../src/api/hotelsApi.js';
import { assistantApi } from '../../src/api/assistantApi.js';

const REAL_HOTEL = {
  id: 7,
  slug: 'country-inn-and-suites-navi-mumbai',
  name: 'Country Inn & Suites by Radisson, Navi Mumbai',
  city: 'Navi Mumbai',
  area: null,
  country: 'India',
  propertyType: 'HOTEL',
  starRating: 4,
  image: { url: 'https://gokaasa.apponext.in/media/hotels/7/cover.jpg' },
  bestOffer: { pricePerNightMinor: 582400, finalTotalMinor: 1164800, nights: 2, mealPlan: 'ROOM_ONLY', freeCancellation: true },
};

/**
 * Exercises the conversation flows requested by the mobile-app validation pass: destination -> dates ->
 * guests -> preferences -> budget -> results (with real-shaped hotel data, never fabricated), empty
 * results, an API error, English/Hindi switching, free-text parsing through the REAL bilingualParser.js
 * (not mocked), and the assistant endpoints' local-parser fallback when /assistant/status reports
 * unconfigured -- asserting assistantApi.extract is never called in that case, exactly like production
 * (verified live: /assistant/status currently 404s there, which the same .catch() path also covers).
 */
describe('AssistantScreen conversation flows', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    assistantApi.status.mockResolvedValue({ configured: false });
  });

  async function openDestinationStep(navigation = { navigate: jest.fn(), goBack: jest.fn() }) {
    await render(<AssistantScreen navigation={navigation} />);
    fireEvent.press(await screen.findByText('Find Hotels'));
    await waitFor(() => expect(screen.getByPlaceholderText('City, area, or hotel')).toBeTruthy());
    return navigation;
  }

  // Presses a step's advance button only once it is actually enabled, then waits for the NEXT step's
  // marker text to appear -- each step transition is its own React state update/re-render, so firing
  // several fireEvent.press() calls back-to-back without waiting in between races ahead of the UI the
  // same way a real, very fast double-tap would, and was the direct cause of this file's first draft
  // failing non-deterministically.
  async function advance(buttonLabel, nextStepMarkerText) {
    // Waits for the button to exist AND be enabled -- some steps (DATES) populate a required field via
    // their own effect a render after the step first appears (see AssistantScreen.js), so the button can
    // briefly still be disabled right when its marker text first renders. Pressing a disabled Pressable
    // is a real no-op (matches actual device behavior), so firing too early would silently never advance.
    await waitFor(() => {
      const button = screen.getByText(buttonLabel);
      expect(button.parent?.props?.accessibilityState?.disabled).not.toBe(true);
    });
    fireEvent.press(screen.getByText(buttonLabel));
    await waitFor(() => expect(screen.getByText(nextStepMarkerText)).toBeTruthy());
  }

  async function goFromDestinationToBudget() {
    fireEvent.press(screen.getByText('Goa'));
    await advance('Continue', 'Check-in');
    await advance('Continue', /room.*adult/i);
    await advance('Continue', 'Amenities');
    await advance('Continue', 'Under ₹2,000 / night');
  }

  test('typing in the destination field after picking a popular-destination chip is not reverted (regression: stale-closure race in onSelect)', async () => {
    await openDestinationStep();

    fireEvent.press(screen.getByText('Goa'));
    const input = screen.getByPlaceholderText('City, area, or hotel');
    await waitFor(() => expect(input.props.value).toBe('Goa'));

    hotelsApi.suggestDestinations.mockResolvedValue([]);
    fireEvent.changeText(input, 'Goa Beach');
    await waitFor(() => expect(input.props.value).toBe('Goa Beach'));
  });

  test('the guided flow (destination -> dates -> guests -> preferences -> budget) reaches real search results', async () => {
    hotelsApi.search.mockResolvedValue({ items: [REAL_HOTEL], total: 1 });
    await openDestinationStep();
    await goFromDestinationToBudget();

    fireEvent.press(screen.getByText('Search real stays'));

    await waitFor(() => expect(hotelsApi.search).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(REAL_HOTEL.name)).toBeTruthy();
    // The exact real price from the mocked (never fabricated) response, not a computed/guessed value.
    expect(screen.getByText('₹5,824')).toBeTruthy();
  });

  test('selecting a real hotel from results closes the chat and opens HotelDetails with the exact search context', async () => {
    hotelsApi.search.mockResolvedValue({ items: [REAL_HOTEL], total: 1 });
    const navigation = await openDestinationStep();
    await goFromDestinationToBudget();
    fireEvent.press(screen.getByText('Search real stays'));

    const hotelName = await screen.findByText(REAL_HOTEL.name);
    fireEvent.press(hotelName);

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledWith(
      'HotelDetails',
      expect.objectContaining({ idOrSlug: REAL_HOTEL.slug, checkIn: expect.any(String), checkOut: expect.any(String), occupancy: expect.any(Array) }),
    );
  });

  test('an empty real search result shows the real "no matching stays" empty state, never fabricated hotels', async () => {
    hotelsApi.search.mockResolvedValue({ items: [], total: 0 });
    await openDestinationStep();
    await goFromDestinationToBudget();
    fireEvent.press(screen.getByText('Search real stays'));

    expect(await screen.findByText('No matching stays found')).toBeTruthy();
  });

  test('a real API failure shows the real error message, not a silent success or fake data', async () => {
    hotelsApi.search.mockRejectedValue({ message: 'We could not reach Gokaasa. Check your connection and try again.' });
    await openDestinationStep();
    await goFromDestinationToBudget();
    fireEvent.press(screen.getByText('Search real stays'));

    expect(await screen.findByText("We couldn't search right now")).toBeTruthy();
    expect(screen.getByText('We could not reach Gokaasa. Check your connection and try again.')).toBeTruthy();
  });

  test('going back from results to change the budget and searching again re-runs the real search (regression: stale results bug)', async () => {
    hotelsApi.search.mockResolvedValueOnce({ items: [REAL_HOTEL], total: 1 }).mockResolvedValueOnce({ items: [], total: 0 });
    await openDestinationStep();
    await goFromDestinationToBudget();
    fireEvent.press(screen.getByText('Search real stays'));
    await waitFor(() => expect(hotelsApi.search).toHaveBeenCalledTimes(1));
    await screen.findByText(REAL_HOTEL.name);

    await advance('Back', 'Under ₹2,000 / night'); // RESULTS -> BUDGET
    fireEvent.press(screen.getByText('Search real stays')); // BUDGET -> RESULTS again

    await waitFor(() => expect(hotelsApi.search).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('No matching stays found')).toBeTruthy();
  });

  test('switching to Hindi changes the chrome\'s own labels (the close button, read via its accessibility label)', async () => {
    await openDestinationStep();
    expect(screen.getByLabelText('Close chat')).toBeTruthy();

    fireEvent.press(screen.getByText('हिन्दी'));

    await waitFor(() => expect(screen.getByLabelText('Chat band karein')).toBeTruthy());
  });

  test('free-text parsing (the real, zero-network bilingualParser) resolves a destination and advances past it', async () => {
    hotelsApi.suggestDestinations.mockResolvedValue([{ type: 'CITY', label: 'Goa', destination: 'goa' }]);
    await openDestinationStep();

    const input = screen.getByLabelText('Message Gokaasa Booking Assistant');
    fireEvent.changeText(input, 'I need a resort in Goa');
    await waitFor(() => expect(screen.getByLabelText('Message Gokaasa Booking Assistant').props.value).toBe('I need a resort in Goa'));
    fireEvent.press(screen.getByLabelText('Send'));

    await waitFor(() => expect(hotelsApi.suggestDestinations).toHaveBeenCalledWith('goa'));
    // Destination resolved to a real place; next required answer (dates) is asked for.
    await waitFor(() => expect(screen.getByText('Check-in')).toBeTruthy());
    expect(assistantApi.extract).not.toHaveBeenCalled();
  });

  test('the local parser is used instead of the AI endpoint whenever /assistant/status reports unconfigured (matches production today: /assistant/extract 404s there)', async () => {
    assistantApi.status.mockResolvedValue({ configured: false });
    hotelsApi.suggestDestinations.mockResolvedValue([]);
    await openDestinationStep();

    const input = screen.getByLabelText('Message Gokaasa Booking Assistant');
    fireEvent.changeText(input, 'two adults, free cancellation');
    await waitFor(() => expect(screen.getByLabelText('Message Gokaasa Booking Assistant').props.value).toBe('two adults, free cancellation'));
    fireEvent.press(screen.getByLabelText('Send'));

    await waitFor(() => expect(screen.queryByLabelText('Message Gokaasa Booking Assistant').props.value).toBe(''));
    expect(assistantApi.extract).not.toHaveBeenCalled();
  });
});
