import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import HotelDetailsScreen from '../../src/screens/HotelDetailsScreen.js';

jest.mock('../../src/api/hotelsApi.js', () => ({
  hotelsApi: { hotel: jest.fn() },
}));
jest.mock('../../src/context/AuthContext.js', () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));
jest.mock('../../src/context/WishlistContext.js', () => ({
  useWishlist: () => ({ isWishlisted: () => false, toggle: jest.fn() }),
}));

import { hotelsApi } from '../../src/api/hotelsApi.js';

/**
 * Regression tests for the real bug reported in this screen: React's "Each child in a list should have
 * a unique key prop" warning, traced to `hotel.cancellationPolicies.map((p) => <Text key={p.id}>...)`.
 * Verified live against production that a real cancellation policy is { code, name, summary } -- there
 * is no `id` field at all, so key={p.id} was key={undefined}. `{p.description}` was also wrong (the real
 * field is `summary`), so this line had been silently rendering "undefined" too.
 */

// A real shape, taken from a live GET /hotels/:slug response (ids/codes kept, trimmed to what this
// screen reads).
const MOCK_HOTEL = {
  id: 1,
  slug: 'abbot-hotel-navi-mumbai',
  name: 'Abbot Hotel',
  propertyType: 'HOTEL',
  starRating: 3,
  guestRating: 4,
  reviewCount: 1,
  area: 'Vashi',
  addressLine: 'Ganesh Mandir Marg, Sector 2',
  city: 'Navi Mumbai',
  state: 'Maharashtra',
  description: 'A hotel in Sector 2, Vashi, Navi Mumbai, near Vashi railway station.',
  amenities: [
    { code: 'WIFI', name: 'Free WiFi', category: 'CONNECTIVITY' },
    { code: 'AC', name: 'Air Conditioning', category: 'ROOM' },
    { code: 'PARKING', name: 'Parking', category: 'TRANSPORT' },
  ],
  images: [{ id: 80, url: 'https://images.example.com/80.jpg', altText: 'Exterior' }],
  cancellationPolicies: [
    { code: 'FREE_CANCELLATION', name: 'Free cancellation', summary: 'Free cancellation if cancelled at least 1 day(s) before check-in.' },
    { code: 'NON_REFUNDABLE', name: 'Non-refundable', summary: 'Non-refundable. No refund after booking.' },
    { code: 'PARTIAL_REFUND', name: 'Partial refund', summary: '50% refund if cancelled at least 2 day(s) before check-in.' },
  ],
};

function renderScreen() {
  const route = { params: { idOrSlug: MOCK_HOTEL.slug } };
  const navigation = { navigate: jest.fn(), replace: jest.fn() };
  return render(<HotelDetailsScreen route={route} navigation={navigation} />);
}

describe('HotelDetailsScreen', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    // Deliberately NOT silenced (no mockImplementation) -- it still forwards to the real console.error
    // while recording calls, so a real React warning both surfaces normally AND is assertable below.
    consoleErrorSpy = jest.spyOn(console, 'error');
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('renders every cancellation policy\'s real summary text, and never a missing-key warning (regression test)', async () => {
    hotelsApi.hotel.mockResolvedValue(MOCK_HOTEL);
    await renderScreen();

    await waitFor(() => expect(screen.queryByText('Abbot Hotel')).toBeTruthy());

    // The actual bug: this used to render "undefined" (wrong field) with a missing key (wrong id field).
    // Each policy now renders as an icon + its summary text (no "• " prefix -- the icon is the bullet).
    expect(screen.getByText('Free cancellation if cancelled at least 1 day(s) before check-in.')).toBeTruthy();
    expect(screen.getByText('Non-refundable. No refund after booking.')).toBeTruthy();
    expect(screen.getByText('50% refund if cancelled at least 2 day(s) before check-in.')).toBeTruthy();
    expect(screen.queryByText('undefined')).toBeNull();

    const keyWarning = consoleErrorSpy.mock.calls.find((args) => String(args[0]).includes('unique') && String(args[0]).includes('key'));
    expect(keyWarning).toBeUndefined();
  });

  test('renders real amenities and the hotel name/description from the live response shape', async () => {
    hotelsApi.hotel.mockResolvedValue(MOCK_HOTEL);
    await renderScreen();

    await waitFor(() => expect(screen.queryByText('Abbot Hotel')).toBeTruthy());
    expect(screen.getByText('Free WiFi')).toBeTruthy();
    expect(screen.getByText('Air Conditioning')).toBeTruthy();
    expect(screen.getByText('Parking')).toBeTruthy();
    expect(screen.getByText(MOCK_HOTEL.description)).toBeTruthy();
  });

  test('the "See available rooms" footer button spans the full footer width (regression: it used to collapse to its label\'s own width and a ~23px height)', async () => {
    // Root cause: AppButton wraps its Pressable in an unstyled <Animated.View> (for the press-scale
    // animation), which defaults to flexDirection: 'column'. A `flex: 1` passed via AppButton's `style`
    // prop lands on the Pressable, one level INSIDE that wrapper -- inside a flexDirection:'row' footer,
    // that `flex: 1` was read relative to the column-direction Animated.View, not the row, so it governed
    // HEIGHT (collapsing to ~23px via flex-basis: 0%) instead of WIDTH (which fell back to the label's own
    // ~185px) -- confirmed by inspecting the real computed layout (react-native-web + a real Chromium
    // layout engine), not a reading of the styles alone. The fix drops the footer's pointless
    // flexDirection: 'row' (it has exactly one child) and the now-unnecessary `style={{flex:1}}` on
    // AppButton, so it fills the footer the same unforced way every other full-width AppButton in this
    // app already does (e.g. HomeScreen's "Search Hotels").
    hotelsApi.hotel.mockResolvedValue(MOCK_HOTEL);
    await renderScreen();
    await waitFor(() => expect(screen.queryByText('Abbot Hotel')).toBeTruthy());

    const label = screen.getByText('See available rooms');
    const button = label.parent; // the Pressable's rendered host node
    const resolvedStyle = Object.assign({}, ...[].concat(button.props.style).filter(Boolean));
    expect(resolvedStyle.flex).toBeUndefined();
    expect(resolvedStyle.height).toBe(48); // AppButton's own "md" size default, not collapsed

    const footer = button.parent.parent; // Pressable -> AppButton's Animated.View -> footer
    const footerStyle = Object.assign({}, ...[].concat(footer.props.style).filter(Boolean));
    expect(footerStyle.flexDirection).not.toBe('row');
  });

  test('renders real similar hotels from the hotel detail response, and tapping one pushes a new HotelDetails instance (not an in-place param swap, so Back returns to this hotel)', async () => {
    hotelsApi.hotel.mockResolvedValue({
      ...MOCK_HOTEL,
      similarHotels: [
        { id: 9, slug: 'nearby-stay-navi-mumbai', name: 'Nearby Stay', city: 'Navi Mumbai', area: 'Vashi', propertyType: 'HOTEL', amenities: [] },
      ],
    });
    const route = { params: { idOrSlug: MOCK_HOTEL.slug, checkIn: '2026-11-12', checkOut: '2026-11-14', occupancy: [{ adults: 2, childAges: [] }] } };
    const navigation = { navigate: jest.fn(), replace: jest.fn(), push: jest.fn() };
    await render(<HotelDetailsScreen route={route} navigation={navigation} />);

    const card = await screen.findByText('Nearby Stay');
    fireEvent.press(card);

    expect(navigation.push).toHaveBeenCalledWith('HotelDetails', {
      idOrSlug: 'nearby-stay-navi-mumbai',
      checkIn: '2026-11-12',
      checkOut: '2026-11-14',
      occupancy: [{ adults: 2, childAges: [] }],
    });
  });

  test('shows a real error state, not a crash, when the hotel fails to load', async () => {
    // hotelsApi.js is mocked wholesale here, so this rejects with the shape the shared response
    // interceptor (client.js) would already have normalized it to in the real app -- a screen only ever
    // sees { status, code, message, fieldErrors }, never a raw axios error.
    hotelsApi.hotel.mockRejectedValue({ status: 404, code: 'NOT_FOUND', message: 'Hotel not found', fieldErrors: {} });
    await renderScreen();

    await waitFor(() => expect(screen.queryByText('Hotel not found')).toBeTruthy());
  });
});
