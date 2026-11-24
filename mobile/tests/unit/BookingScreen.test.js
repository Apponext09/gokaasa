import { render, fireEvent, waitFor } from '@testing-library/react-native';
import BookingScreen from '../../src/screens/BookingScreen.js';

jest.mock('../../src/api/bookingsApi.js', () => ({
  bookingsApi: {
    hold: jest.fn(),
    createHold: jest.fn(),
    release: jest.fn(),
    saveGuests: jest.fn(),
  },
}));

const MOCK_USER = { firstName: 'Samarth', lastName: 'Giram', email: 'samarth@example.com', phone: '9876543210' };
jest.mock('../../src/context/AuthContext.js', () => ({
  useAuth: () => ({
    user: MOCK_USER,
    isAuthenticated: true,
  }),
}));

import { bookingsApi } from '../../src/api/bookingsApi.js';

const MOCK_HOLD = {
  id: 101,
  status: 'HELD',
  secondsRemaining: 600,
  guestDetails: {
    primaryContact: {
      firstName: 'Samarth',
      lastName: 'Giram',
      email: 'samarth@example.com',
      mobile: '9876543210',
    },
    rooms: [
      { roomIndex: 0, guestIndex: 0, firstName: 'Samarth', lastName: 'Giram' },
    ],
  },
  quote: {
    hotel: { id: 1, name: 'The Taj Mahal Palace, Mumbai', address: 'Apollo Bunder, Colaba, Mumbai' },
    room: { id: 2, name: 'Luxury Grande Room' },
    ratePlan: { id: 3, name: 'Breakfast Included', mealPlan: 'BREAKFAST' },
    stay: {
      checkIn: '2026-12-01',
      checkOut: '2026-12-03',
      nights: 2,
      occupancy: [{ adults: 2, childAges: [] }],
    },
    cancellationPolicy: { description: 'Free cancellation up to 24 hours before check-in' },
    totals: {
      currency: 'INR',
      subtotal: 2000000,
      discount: 200000,
      taxes: 216000,
      couponDiscount: 0,
      total: 2016000,
    },
  },
};

describe('BookingScreen - Guest Details Form', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders stay summary and guest contact form prefilled with auth user', async () => {
    bookingsApi.hold.mockResolvedValue(MOCK_HOLD);

    const route = {
      params: {
        holdId: 101,
        hotelName: 'The Taj Mahal Palace, Mumbai',
        roomName: 'Luxury Grande Room',
        planName: 'Breakfast Included',
      },
    };

    const { getByText } = await render(<BookingScreen route={route} navigation={{ navigate: jest.fn() }} />);

    await waitFor(() => expect(getByText('Lead guest details')).toBeTruthy());
    expect(getByText('Continue to review')).toBeTruthy();
  });

  test('submitting guest details saves guests and navigates to BookingReview', async () => {
    bookingsApi.hold.mockResolvedValue(MOCK_HOLD);
    bookingsApi.saveGuests.mockResolvedValue({ id: 101, status: 'HELD' });

    const navigate = jest.fn();
    const route = {
      params: {
        holdId: 101,
        hotelName: 'The Taj Mahal Palace, Mumbai',
        roomName: 'Luxury Grande Room',
        planName: 'Breakfast Included',
      },
    };

    const { getByText } = await render(<BookingScreen route={route} navigation={{ navigate }} />);

    await waitFor(() => expect(getByText('Continue to review')).toBeTruthy());

    const submitBtn = getByText('Continue to review');
    fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(bookingsApi.saveGuests).toHaveBeenCalledWith(
        101,
        expect.objectContaining({
          primaryContact: expect.objectContaining({
            firstName: 'Samarth',
            lastName: 'Giram',
            email: 'samarth@example.com',
            mobile: '9876543210',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('BookingReview', {
        holdId: 101,
        hotelName: 'The Taj Mahal Palace, Mumbai',
        roomName: 'Luxury Grande Room',
        planName: 'Breakfast Included',
      });
    });
  });

  test('pre-fills Room 1 Guest 1 with user details when booking for myself, and clears on someone_else', async () => {
    const holdWithoutRooms = {
      ...MOCK_HOLD,
      guestDetails: null,
    };
    bookingsApi.hold.mockResolvedValue(holdWithoutRooms);
    bookingsApi.saveGuests.mockResolvedValue({ id: 101, status: 'HELD' });

    const navigate = jest.fn();
    const route = {
      params: {
        holdId: 101,
        hotelName: 'The Taj Mahal Palace, Mumbai',
        roomName: 'Luxury Grande Room',
        planName: 'Breakfast Included',
      },
    };

    const { getByText, getAllByDisplayValue, queryAllByDisplayValue } = await render(<BookingScreen route={route} navigation={{ navigate }} />);

    // Both Lead Guest and Room 1 Guest 1 should be auto-filled with Samarth Giram
    await waitFor(() => expect(getAllByDisplayValue('Samarth').length).toBe(2));
    expect(getAllByDisplayValue('Giram').length).toBe(2);

    // Toggle to 'someone_else'
    fireEvent.press(getByText('Someone else'));

    // Both should be cleared
    await waitFor(() => expect(queryAllByDisplayValue('Samarth').length).toBe(0));
  });

  test('allows adding pets and sends pets in saveGuests payload', async () => {
    bookingsApi.hold.mockResolvedValue(MOCK_HOLD);
    bookingsApi.saveGuests.mockResolvedValue({ id: 101, status: 'HELD' });

    const navigate = jest.fn();
    const route = {
      params: {
        holdId: 101,
        hotelName: 'The Taj Mahal Palace, Mumbai',
        roomName: 'Luxury Grande Room',
        planName: 'Breakfast Included',
      },
    };

    const { getByText, getByLabelText, getByPlaceholderText, getByDisplayValue } = await render(<BookingScreen route={route} navigation={{ navigate }} />);

    await waitFor(() => expect(getByText('Pet Details')).toBeTruthy());
    expect(getByText('0 pets')).toBeTruthy();

    // Add pet
    fireEvent.press(getByLabelText('Add pet'));
    await waitFor(() => expect(getByText('1 pet')).toBeTruthy());

    // Fill in pet name and breed
    fireEvent.changeText(getByPlaceholderText('e.g. Bruno, Bella'), 'Bruno');
    await waitFor(() => expect(getByDisplayValue('Bruno')).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('e.g. Labrador, Cat'), 'Labrador');
    await waitFor(() => expect(getByDisplayValue('Labrador')).toBeTruthy());

    // Submit
    const submitBtn = getByText('Continue to review');
    fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(bookingsApi.saveGuests).toHaveBeenCalledWith(
        101,
        expect.objectContaining({
          petsCount: 1,
          pets: [{ name: 'Bruno', breed: 'Labrador' }],
        })
      );
    });
  });
});
