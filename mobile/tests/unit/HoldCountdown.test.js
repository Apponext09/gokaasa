import React, { useState } from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { HoldCountdown } from '../../src/components/HoldCountdown.js';

jest.mock('../../src/components/FadeSlideIn.js', () => {
  const { View } = require('react-native');
  return {
    FadeSlideIn: ({ children }) => <View>{children}</View>,
  };
});

describe('HoldCountdown component', () => {
  test('renders remaining seconds formatted as mm:ss', async () => {
    const { getByText } = await render(
      <HoldCountdown secondsRemaining={150} onExpire={jest.fn()} />
    );
    expect(getByText(/02:30/)).toBeTruthy();
  });

  test('calls onExpire when countdown reaches 0 without setState-in-render warning', async () => {
    function ParentComponent() {
      const [isExpired, setIsExpired] = useState(false);
      return (
        <View>
          <Text>{isExpired ? 'STATUS: EXPIRED' : 'STATUS: ACTIVE'}</Text>
          <HoldCountdown
            secondsRemaining={1}
            onExpire={() => setIsExpired(true)}
          />
        </View>
      );
    }

    const { getByText } = await render(<ParentComponent />);
    expect(getByText('STATUS: ACTIVE')).toBeTruthy();

    await waitFor(
      () => {
        expect(getByText('STATUS: EXPIRED')).toBeTruthy();
      },
      { timeout: 3000 }
    );
  });
});
