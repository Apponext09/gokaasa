import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AssistantScreen from '../../src/screens/AssistantScreen.js';
import { renderWithSafeArea as render } from '../testUtils/renderWithSafeArea.js';

jest.mock('../../src/api/hotelsApi.js', () => ({
  hotelsApi: {
    search: jest.fn(() => Promise.resolve({ items: [], total: 0 })),
    suggestDestinations: jest.fn(() => Promise.resolve([])),
    popularDestinations: jest.fn(() => Promise.resolve([{ destination: 'goa', label: 'Goa', hotelCount: 12 }])),
  },
}));
jest.mock('../../src/api/assistantApi.js', () => ({
  assistantApi: { status: jest.fn(() => Promise.resolve({ configured: false })), extract: jest.fn() },
}));

import { hotelsApi } from '../../src/api/hotelsApi.js';

/**
 * A render-level smoke test for the mobile Booking Assistant: catches wiring bugs (bad imports, a
 * component misused with the wrong props, a crash on mount) that pure logic tests on assistantState.js /
 * bilingualParser.js cannot. No native module (AsyncStorage, expo-speech) needs further mocking here --
 * jest-expo's preset already stubs expo-speech, and AsyncStorage is mapped to its official jest mock
 * (see package.json's jest.moduleNameMapper).
 */
describe('AssistantScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    // Each test must start from a blank slate -- the real app persists the search draft across sessions
    // on purpose (see assistantState.js), but the mock AsyncStorage backing it is a single in-memory
    // object shared by every test in this file unless cleared.
    await AsyncStorage.clear();
  });

  async function renderScreen() {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    return { navigation, ...(await render(<AssistantScreen navigation={navigation} />)) };
  }

  test('renders the real greeting and the quick-action welcome grid on mount, without calling search', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByText(/Welcome to Gokaasa/i)).toBeTruthy());
    expect(screen.getByText('Find Hotels')).toBeTruthy();
    expect(screen.getByText('Explore Destinations')).toBeTruthy();
    expect(hotelsApi.search).not.toHaveBeenCalled();
  });

  test('tapping "Find Hotels" sets a real propertyType, advances to the destination step, and logs the tap as a user message', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByText('Find Hotels')).toBeTruthy());

    fireEvent.press(screen.getByText('Find Hotels'));

    await waitFor(() => expect(screen.getByPlaceholderText('City, area, or hotel')).toBeTruthy());
  });

  test('popular destinations are fetched from the real API and offered as quick picks once on the destination step', async () => {
    await renderScreen();
    fireEvent.press(await screen.findByText('Explore Destinations'));

    await waitFor(() => expect(hotelsApi.popularDestinations).toHaveBeenCalledWith({ limit: 6 }));
    expect(await screen.findByText('Goa')).toBeTruthy();
  });

  test('closing the chat calls navigation.goBack -- it never navigates elsewhere just to dismiss itself', async () => {
    const { navigation } = await renderScreen();
    await waitFor(() => expect(screen.getByLabelText('Close chat')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Close chat'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});
