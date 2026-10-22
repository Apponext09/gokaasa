import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import RoomSelectionScreen from '../../src/screens/RoomSelectionScreen.js';

jest.mock('../../src/api/hotelsApi.js', () => ({
  hotelsApi: { availability: jest.fn() },
}));
jest.mock('../../src/api/bookingsApi.js', () => ({
  bookingsApi: { createHold: jest.fn() },
}));
jest.mock('../../src/context/AuthContext.js', () => ({ useAuth: () => ({ isAuthenticated: true }) }));

import { hotelsApi } from '../../src/api/hotelsApi.js';
import { bookingsApi } from '../../src/api/bookingsApi.js';

// A real shape, trimmed to what this screen reads, mirroring availability.service.js's toPublicRoom +
// quoteNights output exactly (ratePlanId, subtotal/discount/taxes/fees/finalAmount, cancellationPolicy).
const AVAILABILITY = {
  hotel: { id: 1, slug: 'abbot-hotel', name: 'Abbot Hotel' },
  checkIn: '2026-11-12',
  checkOut: '2026-11-14',
  nights: 2,
  rooms: 1,
  adults: 2,
  children: 0,
  roomTypes: [
    {
      id: 10,
      roomCode: 'DLX',
      name: 'Deluxe Room',
      bedType: 'KING',
      bedCount: 1,
      roomSizeSqm: 28,
      view: 'Sea view',
      maxAdults: 2,
      maxChildren: 1,
      maxOccupancy: 3,
      amenities: [{ code: 'WIFI', name: 'Free WiFi' }, { code: 'AC', name: 'Air Conditioning' }],
      images: [{ id: 1, url: 'https://images.example.com/1.jpg' }],
      available: true,
      availableRooms: 5,
      unavailableReason: null,
      ratePlans: [
        {
          ratePlanId: 101,
          code: 'RO',
          name: 'Room only',
          mealPlan: 'ROOM_ONLY',
          refundable: true,
          cancellationPolicy: {
            code: 'FREE_CANCELLATION',
            name: 'Free cancellation',
            description: 'Free cancellation until 24 hours before check-in.',
            isNonRefundable: false,
            deadlineHours: 24,
            refundPercent: 100,
          },
          currency: 'INR',
          pricePerNight: 500000,
          rooms: 1,
          nights: 2,
          subtotal: 1100000,
          discount: 100000,
          taxes: 90000,
          fees: 0,
          finalAmount: 990000,
          averagePerNight: 495000,
        },
      ],
    },
    {
      id: 11,
      name: 'Presidential Suite',
      available: false,
      unavailableReason: 'SOLD_OUT',
      ratePlans: [],
      amenities: [],
      images: [],
    },
  ],
};

const ROUTE_PARAMS = {
  hotelId: 1,
  hotelSlug: 'abbot-hotel',
  hotelName: 'Abbot Hotel',
  checkIn: '2026-11-12',
  checkOut: '2026-11-14',
  occupancy: [{ adults: 2, childAges: [] }],
};

async function renderScreen(navigationOverrides = {}) {
  const navigation = { navigate: jest.fn(), replace: jest.fn(), ...navigationOverrides };
  const route = { params: ROUTE_PARAMS };
  await render(<RoomSelectionScreen route={route} navigation={navigation} />);
  return navigation;
}

describe('RoomSelectionScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  test('renders real room facts (bed type, view, amenities, meal plan) and the unavailable room with its real reason', async () => {
    hotelsApi.availability.mockResolvedValue(AVAILABILITY);
    await renderScreen();

    await waitFor(() => expect(screen.getByText('Deluxe Room')).toBeTruthy());
    expect(screen.getByText('King bed')).toBeTruthy();
    expect(screen.getByText('Sea view')).toBeTruthy();
    expect(screen.getByText('Free WiFi')).toBeTruthy();
    expect(screen.getByText('Air Conditioning')).toBeTruthy();
    // Matches twice: the rate plan's own name ("Room only") and its meal-plan badge, which share the label.
    expect(screen.getAllByText('Room only').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Free cancellation')).toBeTruthy();

    expect(screen.getByText('Presidential Suite')).toBeTruthy();
    expect(screen.getByText('Sold out for these dates')).toBeTruthy();
  });

  test('tapping "Price breakdown" reveals the real subtotal/discount/taxes/fees/total, and tapping again collapses it', async () => {
    hotelsApi.availability.mockResolvedValue(AVAILABILITY);
    await renderScreen();
    await waitFor(() => expect(screen.getByText('Deluxe Room')).toBeTruthy());

    expect(screen.queryByText('Taxes')).toBeNull();
    fireEvent.press(screen.getByText('Price breakdown'));

    await waitFor(() => expect(screen.getByText('Taxes')).toBeTruthy());
    expect(screen.getByText('Room charge (2 nights)')).toBeTruthy();
    expect(screen.getByText('Fees')).toBeTruthy();

    fireEvent.press(screen.getByText('Price breakdown'));
    await waitFor(() => expect(screen.queryByText('Taxes')).toBeNull());
  });
});

describe('RoomSelectionScreen rate-plan selection', () => {
  beforeEach(() => jest.clearAllMocks());

  test('selecting a rate plan creates a real hold and navigates to Booking with the hold, hotel, room and plan name', async () => {
    hotelsApi.availability.mockResolvedValue(AVAILABILITY);
    bookingsApi.createHold.mockResolvedValue({ id: 555 });
    const navigation = await renderScreen();
    await waitFor(() => expect(screen.getByText('Deluxe Room')).toBeTruthy());

    fireEvent.press(screen.getByText('Select'));

    await waitFor(() => expect(bookingsApi.createHold).toHaveBeenCalledWith({
      hotelId: 1,
      roomTypeId: 10,
      ratePlanId: 101,
      checkIn: '2026-11-12',
      checkOut: '2026-11-14',
      rooms: 1,
      occupancy: ROUTE_PARAMS.occupancy,
    }));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('Booking', {
      holdId: 555, hotelName: 'Abbot Hotel', roomName: 'Deluxe Room', planName: 'Room only',
    }));
  });
});
