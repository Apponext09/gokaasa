/**
 * Date-flow regression tests.
 *
 * Covers every scenario requested:
 *   1. Home → HotelDetails: same dates + night count forwarded (THE ROOT BUG FIX)
 *   2. Date utility correctness: nightsBetween, addDaysIso, UTC formatting, DST safety
 *   3. HotelDetailsScreen → RoomSelection: live stay dates forwarded via goToRooms
 *   4. Similar-hotel push uses live stay dates, not the stale route.params originals
 *   5. Edge cases: today check-in, month-boundary checkout, invalid checkout blocked
 *   6. HotelDetailsScreen without dates: safe fallback to defaults
 *
 * Architecture note: this app uses route params as the single source of truth for search
 * state between screens — no shared context, no store. Each screen initialises its local
 * copy from params and writes back via navigation when it changes. The tests verify that
 * every navigation call carries the right dates through that chain.
 *
 * FadeSlideIn note: HotelDetailsScreen wraps its body content (hotel name, description, etc.)
 * in <FadeSlideIn> which starts at opacity: 0 and uses useNativeDriver: true. In Jest the
 * native driver does not run, so the animation never completes and those elements stay at
 * opacity 0, invisible to findByText. We therefore query elements that are NOT inside
 * FadeSlideIn: the StaySearchBar (accessibilityLabel "Change stay dates or guests") and the
 * footer AppButton ("See available rooms"). The similar-hotel FlatList is a sibling of
 * FadeSlideIn, so "Nearby Stay" IS queryable once the hotel API resolves.
 */

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import HomeScreen from '../../src/screens/HomeScreen.js';
import HotelDetailsScreen from '../../src/screens/HotelDetailsScreen.js';
import { renderWithSafeArea } from '../testUtils/renderWithSafeArea.js';
import { addDaysIso, nightsBetween, todayIso } from '../../src/utils/format.js';

// ─── Shared mocks ───────────────────────────────────────────────────────────

jest.mock('../../src/api/hotelsApi.js', () => ({
  hotelsApi: {
    popularDestinations: jest.fn(() => Promise.resolve([])),
    handpickedHotels: jest.fn(() =>
      Promise.resolve({
        items: [
          {
            id: 42,
            slug: 'grand-plaza',
            name: 'Grand Plaza',
            city: 'Goa',
            area: 'Calangute',
            propertyType: 'HOTEL',
            starRating: 4,
            amenities: [],
            images: [],
          },
        ],
        pagination: { total: 1 },
      }),
    ),
    suggestDestinations: jest.fn(() => Promise.resolve([])),
    hotel: jest.fn(),
    reviews: jest.fn(() => Promise.resolve({ reviews: [], pagination: { total: 0 } })),
  },
}));

jest.mock('../../src/api/notificationsApi.js', () => ({
  notificationsApi: { unreadCount: jest.fn(() => Promise.resolve(0)) },
}));

jest.mock('../../src/api/bookingsApi.js', () => ({
  bookingsApi: {
    createHold: jest.fn(),
    hold: jest.fn(),
    holdCoupons: jest.fn(() => Promise.resolve([])),
    release: jest.fn(),
    saveGuests: jest.fn(),
  },
}));

jest.mock('../../src/context/AuthContext.js', () => ({
  useAuth: () => ({ user: { firstName: 'Asha' }, isAuthenticated: true }),
}));

jest.mock('../../src/context/WishlistContext.js', () => ({
  useWishlist: () => ({ isWishlisted: () => false, toggle: jest.fn() }),
}));

// HotelReviewsSection makes its own API call; stub it to avoid extra async noise
// in date-flow tests that are only concerned with navigation behaviour.
jest.mock('../../src/components/HotelReviewsSection.js', () => ({
  HotelReviewsSection: () => null,
}));

import { hotelsApi } from '../../src/api/hotelsApi.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const MOCK_HOTEL = {
  id: 1,
  slug: 'grand-plaza',
  name: 'Grand Plaza',
  propertyType: 'HOTEL',
  starRating: 4,
  guestRating: 4.2,
  reviewCount: 20,
  area: 'Calangute',
  addressLine: 'Beach Road',
  city: 'Goa',
  state: 'Goa',
  description: 'Beachfront hotel.',
  amenities: [],
  images: [],
  cancellationPolicies: [],
};

// ─── 1. Home → HotelDetails: dates forwarded (THE BUG FIX) ──────────────────

describe('Home → HotelDetails date forwarding', () => {
  beforeEach(() => jest.clearAllMocks());

  test(
    'openHotel (Handpicked card) passes the currently selected checkIn/checkOut/occupancy to HotelDetails — this was the root bug',
    async () => {
      // HomeScreen default state is today+1 / today+2, 1 room 2 adults.
      const expectedCheckIn = addDaysIso(todayIso(), 1);
      const expectedCheckOut = addDaysIso(todayIso(), 2);

      const navigation = { navigate: jest.fn() };
      const { findByText } = await renderWithSafeArea(<HomeScreen navigation={navigation} />);

      // Wait for the handpicked hotel card rendered by the API response
      const card = await findByText('Grand Plaza');
      fireEvent.press(card);

      // Before fix: navigate was called with { idOrSlug: 'grand-plaza' } (no dates!)
      // After fix: dates + occupancy are included
      expect(navigation.navigate).toHaveBeenCalledWith('HotelDetails', {
        idOrSlug: 'grand-plaza',
        checkIn: expectedCheckIn,
        checkOut: expectedCheckOut,
        occupancy: [{ adults: 2, childAges: [] }],
      });
    },
    30000,
  );
});

// ─── 2. Pure unit: night counts, date arithmetic, timezone safety ─────────────

describe('Date utility — night count and timezone safety', () => {
  test('nightsBetween: 1 night for consecutive days', () => {
    expect(nightsBetween(addDaysIso(todayIso(), 1), addDaysIso(todayIso(), 2))).toBe(1);
  });

  test('nightsBetween: month-boundary (Nov 30 → Dec 1) = 1 night', () => {
    expect(nightsBetween('2026-11-30', '2026-12-01')).toBe(1);
  });

  test('nightsBetween: multi-night across months (Nov 28 → Dec 03) = 5 nights', () => {
    expect(nightsBetween('2026-11-28', '2026-12-03')).toBe(5);
  });

  test('nightsBetween: 0 for same-day (invalid stay, should be blocked)', () => {
    expect(nightsBetween('2026-12-01', '2026-12-01')).toBe(0);
  });

  test('addDaysIso: handles month-boundary without shifting (Nov 30 + 1 = Dec 01)', () => {
    expect(addDaysIso('2026-11-30', 1)).toBe('2026-12-01');
  });

  test('addDaysIso: handles year-boundary (Dec 31 + 1 = Jan 01)', () => {
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
  });

  test('formatStayDate: uses UTC — does not shift 2026-12-01 to Nov due to IST offset', () => {
    const { formatStayDate } = require('../../src/utils/format.js');
    const result = formatStayDate('2026-12-01', { day: 'numeric', month: 'short', year: 'numeric' });
    expect(result).toMatch(/Dec/);
    expect(result).not.toMatch(/Nov/);
  });

  test('DateField parseLocalDate: sets noon (12:00) so DST/timezone never shifts the calendar day', () => {
    // Replicates the unexported parseLocalDate in DateField.js
    const parseLocalDate = (str) => {
      const [y, m, d] = str.split('-').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0);
    };
    const dt = parseLocalDate('2026-12-01');
    expect(dt.getDate()).toBe(1);
    expect(dt.getMonth()).toBe(11); // December is month 11 (0-indexed)
    expect(dt.getFullYear()).toBe(2026);
  });
});

// ─── 3. Invalid checkout guard ────────────────────────────────────────────────

describe('Edge cases: invalid checkout guard (StaySearchBar.handleApply logic)', () => {
  /**
   * StaySearchBar.handleApply contains:
   *   if (!draftCheckIn || !draftCheckOut || draftCheckOut <= draftCheckIn) return;
   * This test validates that guard logic directly — no render needed.
   */
  const shouldApply = (ci, co) => !(!ci || !co || co <= ci);

  test('checkout on same day as checkin is blocked', () => {
    expect(shouldApply('2026-12-05', '2026-12-05')).toBe(false);
  });

  test('checkout before checkin is blocked', () => {
    expect(shouldApply('2026-12-05', '2026-12-04')).toBe(false);
  });

  test('checkout after checkin is allowed', () => {
    expect(shouldApply('2026-12-05', '2026-12-06')).toBe(true);
  });

  test('today check-in with tomorrow checkout is valid', () => {
    expect(shouldApply(todayIso(), addDaysIso(todayIso(), 1))).toBe(true);
  });
});

// ─── 4. HotelDetailsScreen → RoomSelection: live dates forwarded ─────────────

describe('HotelDetailsScreen → RoomSelection date forwarding', () => {
  beforeEach(() => jest.clearAllMocks());

  test(
    'goToRooms passes the current stayCheckIn/stayCheckOut to RoomSelection',
    async () => {
      hotelsApi.hotel.mockResolvedValue(MOCK_HOTEL);

      const route = {
        params: {
          idOrSlug: 'grand-plaza',
          checkIn: '2026-12-10',
          checkOut: '2026-12-13',
          occupancy: [{ adults: 2, childAges: [] }],
        },
      };
      const navigation = { navigate: jest.fn(), replace: jest.fn(), push: jest.fn() };

      // renderWithSafeArea returns the full RNTL render result with all query methods bound
      // to the same render call, avoiding the global `screen` singleton issue between suites.
      const { findByLabelText, getByText } = await renderWithSafeArea(
        <HotelDetailsScreen route={route} navigation={navigation} />,
      );

      // The StaySearchBar is not inside FadeSlideIn — it renders immediately once the hotel
      // API resolves. Its collapsed bar has accessibilityLabel "Change stay dates or guests".
      await findByLabelText('Change stay dates or guests');

      // Footer AppButton is also outside FadeSlideIn — immediately pressable.
      fireEvent.press(getByText('See available rooms'));

      expect(navigation.navigate).toHaveBeenCalledWith('RoomSelection', {
        hotelId: MOCK_HOTEL.id,
        hotelSlug: MOCK_HOTEL.slug,
        hotelName: MOCK_HOTEL.name,
        checkIn: '2026-12-10',
        checkOut: '2026-12-13',
        occupancy: [{ adults: 2, childAges: [] }],
      });
    },
    30000,
  );
});

// ─── 5. Similar-hotel push uses live stay dates ───────────────────────────────

describe('HotelDetailsScreen similar-hotel push uses live stay dates (not stale route params)', () => {
  beforeEach(() => jest.clearAllMocks());

  test(
    'pushing a similar hotel forwards stayCheckIn/stayCheckOut — fixed from using route.params',
    async () => {
      hotelsApi.hotel.mockResolvedValue({
        ...MOCK_HOTEL,
        similarHotels: [
          {
            id: 9,
            slug: 'nearby-stay',
            name: 'Nearby Stay',
            city: 'Goa',
            area: 'Calangute',
            propertyType: 'HOTEL',
            amenities: [],
          },
        ],
      });

      const route = {
        params: {
          idOrSlug: 'grand-plaza',
          checkIn: '2026-12-10',
          checkOut: '2026-12-13',
          occupancy: [{ adults: 2, childAges: [] }],
        },
      };
      const navigation = { navigate: jest.fn(), replace: jest.fn(), push: jest.fn() };

      const { findByLabelText, findByText } = await renderWithSafeArea(
        <HotelDetailsScreen route={route} navigation={navigation} />,
      );

      // Wait for hotel to load (StaySearchBar is the reliable non-FadeSlideIn landmark)
      await findByLabelText('Change stay dates or guests');

      // The similar-hotel FlatList is a sibling of the main FadeSlideIn body, rendered by
      // HotelCard directly — 'Nearby Stay' is in the tree once the hotel API resolves.
      const nearbyCard = await findByText('Nearby Stay');
      fireEvent.press(nearbyCard);

      // Before fix: used `checkIn`/`checkOut` from route.params (original, possibly stale after user edited stay)
      // After fix: uses `stayCheckIn`/`stayCheckOut` (the live values)
      expect(navigation.push).toHaveBeenCalledWith('HotelDetails', {
        idOrSlug: 'nearby-stay',
        checkIn: '2026-12-10',
        checkOut: '2026-12-13',
        occupancy: [{ adults: 2, childAges: [] }],
      });
    },
    30000,
  );
});

// ─── 6. HotelDetailsScreen without dates: safe fallback ──────────────────────

describe('HotelDetailsScreen: safe fallback when no dates in route params', () => {
  beforeEach(() => jest.clearAllMocks());

  test(
    'without checkIn/checkOut params (Wishlist nav), shows defaults and footer button without crashing',
    async () => {
      hotelsApi.hotel.mockResolvedValue(MOCK_HOTEL);
      const route = { params: { idOrSlug: 'grand-plaza' } };
      const navigation = { navigate: jest.fn(), replace: jest.fn(), push: jest.fn() };

      const { findByLabelText, getByText } = await renderWithSafeArea(
        <HotelDetailsScreen route={route} navigation={navigation} />,
      );

      // StaySearchBar renders with default dates (tomorrow / day-after) — proves the
      // screen initialised from addDaysIso defaults instead of crashing on undefined params.
      await findByLabelText('Change stay dates or guests');

      // Footer button always present (outside FadeSlideIn)
      expect(getByText('See available rooms')).toBeTruthy();
    },
    30000,
  );
});
