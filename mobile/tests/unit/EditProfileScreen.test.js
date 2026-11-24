import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import EditProfileScreen from '../../src/screens/EditProfileScreen.js';

jest.mock('../../src/api/authApi.js', () => ({
  authApi: {
    pendingEmailChange: jest.fn(),
    requestEmailChange: jest.fn(),
    verifyEmailChange: jest.fn(),
    resendEmailChange: jest.fn(),
    cancelEmailChange: jest.fn(),
    changePassword: jest.fn(),
    forgotPassword: jest.fn(),
  },
}));

const mockUpdateProfile = jest.fn();
const mockLogout = jest.fn();
const mockUser = {
  id: 1,
  firstName: 'Samarth',
  lastName: 'Giram',
  phone: '+91 9876543210',
  email: 'samarth@example.com',
};

jest.mock('../../src/context/AuthContext.js', () => ({
  useAuth: () => ({
    user: mockUser,
    updateProfile: mockUpdateProfile,
    logout: mockLogout,
  }),
}));

import { authApi } from '../../src/api/authApi.js';

describe('EditProfileScreen', () => {
  const navigation = {
    goBack: jest.fn(),
    reset: jest.fn(),
    navigate: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    authApi.pendingEmailChange.mockResolvedValue(null);
    jest.spyOn(Alert, 'alert').mockImplementation((title, msg, buttons) => {
      if (buttons && buttons[0]?.onPress) {
        buttons[0].onPress();
      }
    });
  });

  afterEach(() => {
    Alert.alert.mockRestore?.();
  });

  test('renders user details and handles personal information update', async () => {
    mockUpdateProfile.mockResolvedValue({
      id: 1,
      firstName: 'Samarth Updated',
      lastName: 'Giram',
      phone: '+91 9999999999',
    });

    const utils = await render(<EditProfileScreen navigation={navigation} />);

    const firstInput = utils.getByPlaceholderText('First name');
    const lastInput = utils.getByPlaceholderText('Last name');
    const phoneInput = utils.getByPlaceholderText('+91 9876543210');

    expect(firstInput.props.value).toBe('Samarth');
    expect(lastInput.props.value).toBe('Giram');
    expect(phoneInput.props.value).toBe('+91 9876543210');
    expect(utils.getByText('samarth@example.com')).toBeTruthy();

    // Edit first name and phone
    fireEvent.changeText(firstInput, 'Samarth Updated');
    await waitFor(() => expect(firstInput.props.value).toBe('Samarth Updated'));

    fireEvent.changeText(phoneInput, '+91 9999999999');
    await waitFor(() => expect(phoneInput.props.value).toBe('+91 9999999999'));

    // Click "Save changes"
    fireEvent.press(utils.getByText('Save changes'));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        firstName: 'Samarth Updated',
        lastName: 'Giram',
        phone: '+91 9999999999',
      });
      expect(utils.getByText('Profile updated successfully.')).toBeTruthy();
    });
  });

  test('validates required fields and phone number format in personal info', async () => {
    const utils = await render(<EditProfileScreen navigation={navigation} />);

    const firstInput = utils.getByPlaceholderText('First name');
    const lastInput = utils.getByPlaceholderText('Last name');
    const phoneInput = utils.getByPlaceholderText('+91 9876543210');

    // 1. Clear first name
    fireEvent.changeText(firstInput, '   ');
    await waitFor(() => expect(firstInput.props.value).toBe('   '));
    fireEvent.press(utils.getByText('Save changes'));
    await waitFor(() => expect(utils.getByText('First name is required.')).toBeTruthy());
    expect(mockUpdateProfile).not.toHaveBeenCalled();

    // 2. Restore first name and clear last name
    fireEvent.changeText(firstInput, 'Samarth');
    await waitFor(() => expect(firstInput.props.value).toBe('Samarth'));
    fireEvent.changeText(lastInput, '');
    await waitFor(() => expect(lastInput.props.value).toBe(''));
    fireEvent.press(utils.getByText('Save changes'));
    await waitFor(() => expect(utils.getByText('Last name is required.')).toBeTruthy());

    // 3. Invalid phone number format
    fireEvent.changeText(lastInput, 'Giram');
    await waitFor(() => expect(lastInput.props.value).toBe('Giram'));
    fireEvent.changeText(phoneInput, 'invalid-phone');
    await waitFor(() => expect(phoneInput.props.value).toBe('invalid-phone'));
    fireEvent.press(utils.getByText('Save changes'));
    await waitFor(() =>
      expect(utils.getByText('Enter a valid phone number (e.g. +91 9876543210).')).toBeTruthy()
    );
  });

  test('handles email change request, resend, and verify OTP flow', async () => {
    authApi.requestEmailChange.mockResolvedValue({
      message: 'A verification code was sent to your new email address.',
    });
    authApi.verifyEmailChange.mockResolvedValue({
      message: 'Email updated successfully.',
    });

    const utils = await render(<EditProfileScreen navigation={navigation} />);

    // Tap "Change email"
    fireEvent.press(utils.getByText('Change email'));

    // Should see new email and current password inputs
    await waitFor(() => expect(utils.getByPlaceholderText('new.email@example.com')).toBeTruthy());
    const newEmailInput = utils.getByPlaceholderText('new.email@example.com');
    const pwdInput = utils.getByPlaceholderText('Your current password');

    // Fill new email and password
    fireEvent.changeText(newEmailInput, 'newemail@example.com');
    await waitFor(() => expect(newEmailInput.props.value).toBe('newemail@example.com'));

    fireEvent.changeText(pwdInput, 'Password123');
    await waitFor(() => expect(pwdInput.props.value).toBe('Password123'));

    fireEvent.press(utils.getByText('Send verification code'));

    await waitFor(() => {
      expect(authApi.requestEmailChange).toHaveBeenCalledWith({
        newEmail: 'newemail@example.com',
        currentPassword: 'Password123',
      });
    });

    // Code input should now appear
    await waitFor(() => {
      expect(utils.getByPlaceholderText('e.g. 123456')).toBeTruthy();
    });

    // Enter 6-digit code and verify
    const codeInput = utils.getByPlaceholderText('e.g. 123456');
    fireEvent.changeText(codeInput, '123456');
    await waitFor(() => expect(codeInput.props.value).toBe('123456'));

    fireEvent.press(utils.getByText('Verify and update email'));

    await waitFor(() => {
      expect(authApi.verifyEmailChange).toHaveBeenCalledWith({ code: '123456' });
      expect(Alert.alert).toHaveBeenCalledWith(
        'Email Changed',
        expect.stringContaining('Please sign in with your new email.'),
        expect.any(Array)
      );
      expect(mockLogout).toHaveBeenCalled();
      expect(navigation.reset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: 'Auth', params: { screen: 'Login' } }],
      });
    });
  });

  test('cancels pending email change request cleanly', async () => {
    authApi.pendingEmailChange.mockResolvedValue({
      newEmail: 'pending.verification@example.com',
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });
    authApi.cancelEmailChange.mockResolvedValue({ ok: true });

    const utils = await render(<EditProfileScreen navigation={navigation} />);

    // Screen loads with pending email change active
    await waitFor(() => {
      expect(utils.getByText(/pending\.verification@example\.com/)).toBeTruthy();
      expect(utils.getByText('Cancel')).toBeTruthy();
    });

    // Press Cancel
    fireEvent.press(utils.getByText('Cancel'));

    await waitFor(() => {
      expect(authApi.cancelEmailChange).toHaveBeenCalledTimes(1);
      expect(utils.getByText('Email change request cancelled.')).toBeTruthy();
    });
  });

  test('sends password reset link to user email upon request', async () => {
    authApi.forgotPassword.mockResolvedValue({
      message: 'Reset link sent.',
    });

    const utils = await render(<EditProfileScreen navigation={navigation} />);

    expect(utils.getByText('Password & Security')).toBeTruthy();
    expect(
      utils.getByText(
        'We will send a password reset link to your registered email address (samarth@example.com).'
      )
    ).toBeTruthy();

    const sendBtn = utils.getByText('Send reset link');
    fireEvent.press(sendBtn);

    await waitFor(() => {
      expect(authApi.forgotPassword).toHaveBeenCalledWith({
        email: 'samarth@example.com',
      });
      expect(Alert.alert).toHaveBeenCalledWith(
        'Reset Link Sent',
        'Reset link sent.',
        [{ text: 'OK' }]
      );
    });

    await waitFor(() => {
      expect(utils.getByText('Resend reset link')).toBeTruthy();
    });
  });
});
