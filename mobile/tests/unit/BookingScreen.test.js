/*  */import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import BookingScreen from '../../src/screens/BookingScreen.js';

jest.mock('../../src/api/bookingsApi.js', () => ({
  bookingsApi: {
    hold: jest.fn(),
    createHold: jest.fn(),
    release: jest.fn(),
    saveGuests: jest.fn(),
    holdCoupons: jest.fn(),
    applyCoupon: jest.fn(),
    removeCoupon: jest.fn(),
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
    coupon: null,
  },
};

const MOCK_COUPONS = [
  {
    code: 'WELCOME10',
    title: 'Flat 10% OFF',
    description: 'Special welcome offer on your stay',
    discountMinor: 200000,
  },
];

describe('BookingScreen - Offers & Coupons integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders Offers & Coupons section and displays available offers', async () => {
    bookingsApi.hold.mockResolvedValue(MOCK_HOLD);
    bookingsApi.holdCoupons.mockResolvedValue(MOCK_COUPONS);

    const route = {
      params: {
        holdId: 101,
        hotelName: 'The Taj Mahal Palace, Mumbai',
        roomName: 'Luxury Grande Room',
        planName: 'Breakfast Included',
      },
    };

    await render(<BookingScreen route={route} navigation={{ navigate: jest.fn() }} />);

    await waitFor(() => expect(screen.getByText('Offers & Coupons')).toBeTruthy());
    await waitFor(() => expect(bookingsApi.holdCoupons).toHaveBeenCalledWith(101));
    await waitFor(() => expect(screen.getByText('WELCOME10')).toBeTruthy());
    expect(screen.getByText('Flat 10% OFF')).toBeTruthy();
  });

  test('tapping Apply on an available offer calls applyCoupon and updates price breakdown', async () => {
    bookingsApi.hold.mockResolvedValue(MOCK_HOLD);
    bookingsApi.holdCoupons.mockResolvedValue(MOCK_COUPONS);

    const updatedHold = {
      ...MOCK_HOLD,
      quote: {
        ...MOCK_HOLD.quote,
        coupon: { code: 'WELCOME10' },
        totals: {
          ...MOCK_HOLD.quote.totals,
          couponDiscount: 200000,
          total: 1816000,
        },
      },
    };
    bookingsApi.applyCoupon.mockResolvedValue(updatedHold);

    const route = {
      params: {
        holdId: 101,
        hotelName: 'The Taj Mahal Palace, Mumbai',
        roomName: 'Luxury Grande Room',
        planName: 'Breakfast Included',
      },
    };

    await render(<BookingScreen route={route} navigation={{ navigate: jest.fn() }} />);

    await waitFor(() => expect(screen.getByText('WELCOME10')).toBeTruthy());

    // Press Apply button next to the offer
    const applyButtons = screen.getAllByText('Apply');
    fireEvent.press(applyButtons[applyButtons.length - 1]);

    await waitFor(() => expect(bookingsApi.applyCoupon).toHaveBeenCalledWith(101, 'WELCOME10'));
    await waitFor(() => expect(screen.getByText('Remove')).toBeTruthy());
  });

  test('removing an applied coupon calls removeCoupon and restores available offers', async () => {
    const appliedHold = {
      ...MOCK_HOLD,
      quote: {
        ...MOCK_HOLD.quote,
        coupon: { code: 'WELCOME10' },
        totals: {
          ...MOCK_HOLD.quote.totals,
          couponDiscount: 200000,
          total: 1816000,
        },
      },
    };
    bookingsApi.hold.mockResolvedValue(appliedHold);
    bookingsApi.removeCoupon.mockResolvedValue(MOCK_HOLD);
    bookingsApi.holdCoupons.mockResolvedValue(MOCK_COUPONS);

    const route = {
      params: {
        holdId: 101,
        hotelName: 'The Taj Mahal Palace, Mumbai',
        roomName: 'Luxury Grande Room',
        planName: 'Breakfast Included',
      },
    };

    await render(<BookingScreen route={route} navigation={{ navigate: jest.fn() }} />);

    await waitFor(() => expect(screen.getByText('Remove')).toBeTruthy());

    fireEvent.press(screen.getByText('Remove'));

    await waitFor(() => expect(bookingsApi.removeCoupon).toHaveBeenCalledWith(101));
    await waitFor(() => expect(bookingsApi.holdCoupons).toHaveBeenCalledWith(101));
  });

  test('entering manual coupon code in input and pressing Apply calls applyCoupon', async () => {
    bookingsApi.hold.mockResolvedValue(MOCK_HOLD);
    bookingsApi.holdCoupons.mockResolvedValue(MOCK_COUPONS);

    const updatedHold = {
      ...MOCK_HOLD,
      quote: {
        ...MOCK_HOLD.quote,
        coupon: { code: 'SAVE500' },
        totals: {
          ...MOCK_HOLD.quote.totals,
          couponDiscount: 50000,
          total: 1966000,
        },
      },
    };
    bookingsApi.applyCoupon.mockResolvedValue(updatedHold);

    const route = {
      params: {
        holdId: 101,
        hotelName: 'The Taj Mahal Palace, Mumbai',
        roomName: 'Luxury Grande Room',
        planName: 'Breakfast Included',
      },
    };

    await render(<BookingScreen route={route} navigation={{ navigate: jest.fn() }} />);

    await waitFor(() => expect(screen.getByPlaceholderText('Enter coupon code')).toBeTruthy());

    const input = screen.getByPlaceholderText('Enter coupon code');
    fireEvent.changeText(input, 'SAVE500');
    await waitFor(() => expect(input.props.value).toBe('SAVE500'));

    const applyButton = screen.getByTestId('apply-coupon-button');
    fireEvent.press(applyButton);

    await waitFor(() => expect(bookingsApi.applyCoupon).toHaveBeenCalledWith(101, 'SAVE500'));
    await waitFor(() => expect(screen.getByText('Coupon (SAVE500)')).toBeTruthy());
  });

  test('displays error message when coupon application fails', async () => {
    bookingsApi.hold.mockResolvedValue(MOCK_HOLD);
    bookingsApi.holdCoupons.mockResolvedValue(MOCK_COUPONS);
    bookingsApi.applyCoupon.mockRejectedValue(new Error('Coupon has expired or is invalid.'));

    const route = {
      params: {
        holdId: 101,
        hotelName: 'The Taj Mahal Palace, Mumbai',
        roomName: 'Luxury Grande Room',
        planName: 'Breakfast Included',
      },
    };

    await render(<BookingScreen route={route} navigation={{ navigate: jest.fn() }} />);

    await waitFor(() => expect(screen.getByPlaceholderText('Enter coupon code')).toBeTruthy());

    const input = screen.getByPlaceholderText('Enter coupon code');
    fireEvent.changeText(input, 'EXPIRED10');
    await waitFor(() => expect(input.props.value).toBe('EXPIRED10'));

    const applyButton = screen.getByTestId('apply-coupon-button');
    fireEvent.press(applyButton);

    await waitFor(() => expect(screen.getByText('Coupon has expired or is invalid.')).toBeTruthy());
  });
});
