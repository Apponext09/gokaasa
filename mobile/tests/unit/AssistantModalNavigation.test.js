import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import AssistantScreen from '../../src/screens/AssistantScreen.js';
import { renderWithSafeArea as render } from '../testUtils/renderWithSafeArea.js';

jest.mock('../../src/api/hotelsApi.js', () => ({
  hotelsApi: {
    search: jest.fn(() => Promise.resolve({ items: [], total: 0 })),
    suggestDestinations: jest.fn(() => Promise.resolve([])),
    popularDestinations: jest.fn(() => Promise.resolve([])),
  },
}));
jest.mock('../../src/api/assistantApi.js', () => ({
  assistantApi: { status: jest.fn(() => Promise.resolve({ configured: false })), extract: jest.fn() },
}));

const Stack = createNativeStackNavigator();

/**
 * Stands in for whatever real screen (HotelDetails, Home, Search, ...) was on top when the user opened
 * the Assistant -- it tracks how many times it has MOUNTED, and exposes a button to bump its own local
 * state, so these tests can prove the real mechanism this app's "opening/closing preserves the
 * underlying screen" claim rests on: a native-stack push/pop, not any bespoke save/restore logic.
 */
function ProbeScreen({ navigation, mountCountRef }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    mountCountRef.current += 1;
  }, [mountCountRef]);
  return (
    <View>
      <Text>Probe screen</Text>
      <Text testID="probe-count">{count}</Text>
      <Pressable onPress={() => setCount((c) => c + 1)}>
        <Text>Bump</Text>
      </Pressable>
      <Pressable onPress={() => navigation.navigate('Assistant')}>
        <Text>Open assistant</Text>
      </Pressable>
    </View>
  );
}

function TestRootNavigator({ mountCountRef }) {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Probe">{(props) => <ProbeScreen {...props} mountCountRef={mountCountRef} />}</Stack.Screen>
        <Stack.Screen name="HotelDetails">{() => <Text>Hotel details stub</Text>}</Stack.Screen>
        <Stack.Screen name="Assistant" component={AssistantScreen} options={{ presentation: 'modal' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

describe('opening/closing the Assistant preserves the screen underneath (real react-navigation stack)', () => {
  test('the underlying screen is never unmounted or remounted, and its own local state survives', async () => {
    const mountCountRef = { current: 0 };
    await render(<TestRootNavigator mountCountRef={mountCountRef} />);
    expect(mountCountRef.current).toBe(1);

    // Prove real, in-component state (not just route params) survives the round trip.
    fireEvent.press(screen.getByText('Bump'));
    await waitFor(() => expect(screen.getByTestId('probe-count').props.children).toBe(1));
    fireEvent.press(screen.getByText('Bump'));
    await waitFor(() => expect(screen.getByTestId('probe-count').props.children).toBe(2));

    fireEvent.press(screen.getByText('Open assistant'));
    await waitFor(() => expect(screen.getByLabelText('Close chat')).toBeTruthy());
    // Pushing a new screen does not run the Probe screen's mount effect again.
    expect(mountCountRef.current).toBe(1);

    fireEvent.press(screen.getByLabelText('Close chat'));
    await waitFor(() => expect(screen.getByText('Probe screen')).toBeTruthy());

    // Still mounted exactly once, and its state from before the chat opened is exactly as it was left.
    expect(mountCountRef.current).toBe(1);
    expect(screen.getByTestId('probe-count').props.children).toBe(2);
  });
});
