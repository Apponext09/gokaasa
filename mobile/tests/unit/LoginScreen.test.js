import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import LoginScreen from '../../src/screens/LoginScreen.js';

const mockLogin = jest.fn();
const mockLoginWithGoogle = jest.fn();

jest.mock('../../src/context/AuthContext.js', () => ({
  useAuth: () => ({
    login: mockLogin,
    loginWithGoogle: mockLoginWithGoogle,
  }),
}));

describe('LoginScreen', () => {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn(() => true),
    getParent: jest.fn(() => ({ goBack: jest.fn() })),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders email/password form, sign-in button, and continue with google button', async () => {
    const utils = await render(<LoginScreen navigation={navigation} />);

    expect(utils.getByText('Welcome back')).toBeTruthy();
    expect(utils.getByPlaceholderText('you@example.com')).toBeTruthy();
    expect(utils.getByPlaceholderText('••••••••')).toBeTruthy();
    expect(utils.getByText('Sign in')).toBeTruthy();
    expect(utils.getByText('Continue with Google')).toBeTruthy();
  });

  test('submitting email and password calls login and navigates back on success', async () => {
    mockLogin.mockResolvedValue({ ok: true, user: { id: 1 } });
    const utils = await render(<LoginScreen navigation={navigation} />);

    const emailInput = utils.getByPlaceholderText('you@example.com');
    const pwdInput = utils.getByPlaceholderText('••••••••');

    fireEvent.changeText(emailInput, 'user@example.com');
    await waitFor(() => expect(emailInput.props.value).toBe('user@example.com'));

    fireEvent.changeText(pwdInput, 'Password123');
    await waitFor(() => expect(pwdInput.props.value).toBe('Password123'));

    fireEvent.press(utils.getByText('Sign in'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('user@example.com', 'Password123');
      expect(navigation.navigate).toHaveBeenCalledWith('Main', { screen: 'Home' });
    });
  });

  test('continue with google alerts with guidance when client ID is not yet set in environment', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    delete process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

    const utils = await render(<LoginScreen navigation={navigation} />);
    fireEvent.press(utils.getByText('Continue with Google'));

    expect(alertSpy).toHaveBeenCalledWith(
      'Google Sign-In',
      expect.stringContaining('EXPO_PUBLIC_GOOGLE_CLIENT_ID'),
      expect.any(Array)
    );
    alertSpy.mockRestore();
  });

  test('continue with google calls loginWithGoogle when client ID is configured', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
    mockLoginWithGoogle.mockResolvedValue({ ok: true, user: { id: 5, firstName: 'Google' } });

    const utils = await render(<LoginScreen navigation={navigation} />);
    fireEvent.press(utils.getByText('Continue with Google'));

    await waitFor(() => {
      expect(mockLoginWithGoogle).toHaveBeenCalledWith({ credential: expect.any(String) });
      expect(navigation.navigate).toHaveBeenCalledWith('Main', { screen: 'Home' });
    });

    delete process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  });
});
