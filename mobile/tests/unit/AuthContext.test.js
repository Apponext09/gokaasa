import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../../src/context/AuthContext.js';

/**
 * These are pure contract/unit tests against mocked API modules -- they prove the CLIENT-SIDE state
 * machine (session restore, login, register, logout) behaves correctly for a given server response.
 * They are NOT evidence the real backend works; that was verified separately, live, against
 * https://gokaasa.apponext.in/api (see the session's own diagnostic notes) by actually registering and
 * logging into a disposable test account and inspecting the real HTTP responses.
 */

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/api/authApi.js', () => ({
  authApi: {
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(() => Promise.resolve()),
    me: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  },
}));

jest.mock('../../src/api/client.js', () => {
  const actual = jest.requireActual('../../src/api/client.js');
  return { ...actual, refreshAccessToken: jest.fn() };
});

import { authApi } from '../../src/api/authApi.js';
import { refreshAccessToken } from '../../src/api/client.js';

function renderAuth() {
  return renderHook(() => useAuth(), { wrapper: AuthProvider });
}

describe('AuthContext', () => {
  beforeEach(() => jest.clearAllMocks());

  /**
   * Regression test for a real, confirmed bug: session restoration on app launch used to call
   * authApi.me(), but the shared response interceptor never auto-refreshes a 401 from ANY /auth/*
   * endpoint (including /auth/me) -- so an expired-but-refreshable session was being wrongly signed out.
   * The fix calls refreshAccessToken() (POST /auth/refresh) directly on startup instead, exactly like the
   * website's own AuthContext.jsx.
   */
  test('startup: a valid refresh cookie restores an authenticated session via refreshAccessToken, never authApi.me', async () => {
    refreshAccessToken.mockResolvedValue({ accessToken: 'tok123', user: { id: 1, firstName: 'Mobile' } });
    const { result } = await renderAuth();

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(result.current.user.firstName).toBe('Mobile');
    expect(authApi.me).not.toHaveBeenCalled();
  });

  test('startup: a missing/expired refresh cookie signs the user out cleanly, never crashes', async () => {
    refreshAccessToken.mockRejectedValue({ status: 401, code: 'UNAUTHORIZED', message: 'Session expired', fieldErrors: {} });
    const { result } = await renderAuth();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  test('login success sets an authenticated session from the real response shape ({accessToken, user})', async () => {
    refreshAccessToken.mockRejectedValue({ status: 401, code: 'UNAUTHORIZED', message: 'none', fieldErrors: {} });
    authApi.login.mockResolvedValue({ accessToken: 'tok', user: { id: 4, firstName: 'Mobile' } });
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let response;
    await act(async () => {
      response = await result.current.login('mobile@example.com', 'TestPass123');
    });
    expect(response.ok).toBe(true);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user.id).toBe(4);
  });

  /**
   * Regression test for the double-normalization bug: before the fix, every login failure showed
   * "Something went wrong. Please try again." regardless of what actually went wrong. Verified live
   * against production that a wrong-password login returns message: "Invalid email or password" --
   * this test proves that exact message now survives all the way to the caller.
   */
  test('login failure surfaces the REAL server message, not a generic fallback (regression test)', async () => {
    refreshAccessToken.mockRejectedValue({ status: 401, code: 'UNAUTHORIZED', message: 'none', fieldErrors: {} });
    authApi.login.mockRejectedValue({ status: 401, code: 'UNAUTHORIZED', message: 'Invalid email or password', fieldErrors: {} });
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let response;
    await act(async () => {
      response = await result.current.login('mobile@example.com', 'wrong');
    });
    expect(response.ok).toBe(false);
    expect(response.error.message).toBe('Invalid email or password');
    expect(result.current.isAuthenticated).toBe(false);
  });

  test('register failure surfaces field-level validation errors from the server, not a generic message', async () => {
    refreshAccessToken.mockRejectedValue({ status: 401, code: 'UNAUTHORIZED', message: 'none', fieldErrors: {} });
    authApi.register.mockRejectedValue({
      status: 422,
      code: 'UNPROCESSABLE',
      message: 'Please correct the highlighted fields',
      fieldErrors: { 'body.email': 'Enter a valid email address' },
    });
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let response;
    await act(async () => {
      response = await result.current.register({ firstName: 'A', lastName: 'B', email: 'bad', password: 'short' });
    });
    expect(response.ok).toBe(false);
    expect(response.error.fieldErrors['body.email']).toBe('Enter a valid email address');
  });

  test('logout clears the session locally even when the network call fails', async () => {
    refreshAccessToken.mockResolvedValue({ accessToken: 'tok', user: { id: 1, firstName: 'Mobile' } });
    authApi.logout.mockRejectedValue(new Error('network down'));
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });
});
