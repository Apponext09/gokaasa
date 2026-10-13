import { launcherBottomOffset, shouldShowAssistantLauncher } from '../../src/components/assistant/AssistantLauncher.js';

describe('shouldShowAssistantLauncher', () => {
  test('shows on ordinary customer-facing screens', () => {
    expect(shouldShowAssistantLauncher('Home')).toBe(true);
    expect(shouldShowAssistantLauncher('Search')).toBe(true);
    expect(shouldShowAssistantLauncher('HotelDetails')).toBe(true);
    expect(shouldShowAssistantLauncher('MyTrips')).toBe(true);
    expect(shouldShowAssistantLauncher('Wishlist')).toBe(true);
    expect(shouldShowAssistantLauncher('Profile')).toBe(true);
    expect(shouldShowAssistantLauncher('BookingDetails')).toBe(true);
    expect(shouldShowAssistantLauncher('Notifications')).toBe(true);
  });

  test('hides on the Assistant screen itself (no launching the chat from inside the chat)', () => {
    expect(shouldShowAssistantLauncher('Assistant')).toBe(false);
  });

  test('hides on every Auth screen', () => {
    expect(shouldShowAssistantLauncher('Auth')).toBe(false);
    expect(shouldShowAssistantLauncher('Login')).toBe(false);
    expect(shouldShowAssistantLauncher('Register')).toBe(false);
    expect(shouldShowAssistantLauncher('ForgotPassword')).toBe(false);
  });

  test('hides on every screen with a real payment or a time-boxed hold in progress', () => {
    expect(shouldShowAssistantLauncher('RoomSelection')).toBe(false);
    expect(shouldShowAssistantLauncher('Booking')).toBe(false);
    expect(shouldShowAssistantLauncher('Payment')).toBe(false);
    expect(shouldShowAssistantLauncher('BookingConfirmation')).toBe(false);
  });

  test('hides when there is no route yet (e.g. before NavigationContainer has reported onReady)', () => {
    expect(shouldShowAssistantLauncher(undefined)).toBe(false);
    expect(shouldShowAssistantLauncher(null)).toBe(false);
  });
});

describe('launcherBottomOffset', () => {
  test('uses the default (tab-bar) clearance on an ordinary screen', () => {
    expect(launcherBottomOffset('Home', 0)).toBe(72);
    expect(launcherBottomOffset('Search', 34)).toBe(106);
  });

  test('uses extra clearance on HotelDetails, which has its own sticky "See available rooms" CTA bar instead of a tab bar (regression: the launcher used to sit on top of it)', () => {
    expect(launcherBottomOffset('HotelDetails', 0)).toBe(96);
    expect(launcherBottomOffset('HotelDetails', 34)).toBe(130);
    expect(launcherBottomOffset('HotelDetails', 0)).toBeGreaterThan(launcherBottomOffset('Home', 0));
  });

  test('always adds the real device inset on top of the clearance, never ignoring it', () => {
    expect(launcherBottomOffset('Home', 20)).toBe(launcherBottomOffset('Home', 0) + 20);
  });
});
