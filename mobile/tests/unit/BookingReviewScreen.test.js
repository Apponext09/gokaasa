import { render, fireEvent, waitFor } from '@testing-library/react-native';
import BookingReviewScreen from '../../src/screens/BookingReviewScreen.js';

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

jest.mock('../../src/api/paymentsApi.js', () => ({
  paymentsApi: {
    createOrder: jest.fn(),
    verify: jest.fn(),
    failed: jest.fn(),
    devCheckout: jest.fn(),
  },
}));

import { bookingsApi } from '../../src/api/bookingsApi.js';
import { paymentsApi } from '../../src/api/paymentsApi.js';

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
    specialRequest: 'Quiet room on higher floor',
  },
  quote: {
    hotel: { id: 1, name: 'The Taj Mahal Palace, Mumbai', address: 'Apollo Bunder, Colaba, Mumbai' },
    room: { id: 2, name: 'Luxury Grande Room' },
    ratePlan: { id: 3, name: 'Breakfast Included', mealPlan: 'BREAKFAST', isRefundable: true },
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

describe('BookingReviewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders review summary (hotel, room, guest, price, cancellation policy)', async () => {
    bookingsApi.hold.mockResolvedValue(MOCK_HOLD);
    bookingsApi.holdCoupons.mockResolvedValue(MOCK_COUPONS);

    const route = { params: { holdId: 101 } };
    const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };

    const { getByText } = await render(<BookingReviewScreen route={route} navigation={navigation} />);

    await waitFor(() => expect(getByText('The Taj Mahal Palace, Mumbai')).toBeTruthy());
    expect(getByText('Luxury Grande Room')).toBeTruthy();
    expect(getByText('Samarth Giram')).toBeTruthy();
    expect(getByText('samarth@example.com')).toBeTruthy();
    expect(getByText('9876543210')).toBeTruthy();
    expect(getByText('Price breakdown')).toBeTruthy();
    expect(getByText('Pay now')).toBeTruthy();
  });

  test('renders room-by-room guest names and pet details in guest details card', async () => {
    const holdWithGuestsAndPets = {
      ...MOCK_HOLD,
      guestDetails: {
        ...MOCK_HOLD.guestDetails,
        rooms: [
          {
            roomIndex: 0,
            guests: [
              { firstName: 'Samarth', lastName: 'Giram', age: 29 },
              { firstName: 'Priya', lastName: 'Sharma', age: 26 },
            ],
          },
          {
            roomIndex: 1,
            guests: [
              { firstName: 'Rahul', lastName: 'Verma', age: 35 },
            ],
          },
        ],
        pets: [
          { name: 'Bruno', breed: 'Labrador' },
          { name: 'Bella', breed: 'Golden Retriever' },
        ],
      },
    };
    bookingsApi.hold.mockResolvedValue(holdWithGuestsAndPets);
    bookingsApi.holdCoupons.mockResolvedValue([]);

    const route = { params: { holdId: 101 } };
    const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };

    const { getByText } = await render(<BookingReviewScreen route={route} navigation={navigation} />);

    await waitFor(() => expect(getByText('The Taj Mahal Palace, Mumbai')).toBeTruthy());
    expect(getByText('Room 1:')).toBeTruthy();
    expect(getByText('1) Samarth Giram (29), 2) Priya Sharma (26)')).toBeTruthy();
    expect(getByText('Room 2:')).toBeTruthy();
    expect(getByText('1) Rahul Verma (35)')).toBeTruthy();
    expect(getByText('🐾 Pets:')).toBeTruthy();
    expect(getByText('1) Bruno (Labrador), 2) Bella (Golden Retriever)')).toBeTruthy();
  });

  test('applies an available coupon and updates price breakdown', async () => {
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

    const route = { params: { holdId: 101 } };
    const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };

    const { getByText, getAllByText } = await render(<BookingReviewScreen route={route} navigation={navigation} />);

    await waitFor(() => expect(getByText('WELCOME10')).toBeTruthy());

    // Press Apply button next to the available offer
    const applyButtons = getAllByText('Apply');
    fireEvent.press(applyButtons[applyButtons.length - 1]);

    await waitFor(() => expect(bookingsApi.applyCoupon).toHaveBeenCalledWith(101, 'WELCOME10'));
    await waitFor(() => expect(getByText('Remove')).toBeTruthy());
  });

  test('entering manual coupon in input and applying updates hold', async () => {
    bookingsApi.hold.mockResolvedValue(MOCK_HOLD);
    bookingsApi.holdCoupons.mockResolvedValue([]);

    const updatedHold = {
      ...MOCK_HOLD,
      quote: {
        ...MOCK_HOLD.quote,
        coupon: { code: 'SPECIAL50' },
        totals: {
          ...MOCK_HOLD.quote.totals,
          couponDiscount: 50000,
          total: 1966000,
        },
      },
    };
    bookingsApi.applyCoupon.mockResolvedValue(updatedHold);

    const route = { params: { holdId: 101 } };
    const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };

    const { getByPlaceholderText, getByTestId } = await render(
      <BookingReviewScreen route={route} navigation={navigation} />
    );

    await waitFor(() => expect(getByPlaceholderText('Enter coupon code')).toBeTruthy());
    const input = getByPlaceholderText('Enter coupon code');
    fireEvent.changeText(input, 'SPECIAL50');
    await waitFor(() => expect(input.props.value).toBe('SPECIAL50'));

    const applyButton = getByTestId('apply-coupon-button');
    fireEvent.press(applyButton);

    await waitFor(() => expect(bookingsApi.applyCoupon).toHaveBeenCalledWith(101, 'SPECIAL50'));
  });

  test('tapping Pay now initiates payment order creation', async () => {
    bookingsApi.hold.mockResolvedValue(MOCK_HOLD);
    bookingsApi.holdCoupons.mockResolvedValue([]);
    paymentsApi.createOrder.mockResolvedValue({
      orderId: 'order_test_123',
      bookingId: 42,
      bookingRef: 'GK-2026-999999',
      amount: 2016000,
      currency: 'INR',
      keyId: 'rzp_test_xyz',
      simulated: true,
    });

    const route = { params: { holdId: 101 } };
    const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };

    const { getByText } = await render(<BookingReviewScreen route={route} navigation={navigation} />);

    await waitFor(() => expect(getByText('Pay now')).toBeTruthy());
    fireEvent.press(getByText('Pay now'));

    await waitFor(() => expect(paymentsApi.createOrder).toHaveBeenCalledWith(101));
    await waitFor(() => expect(getByText('Simulated Checkout')).toBeTruthy());
  });

  test('simulating successful payment verifies and navigates to BookingConfirmation', async () => {
    bookingsApi.hold.mockResolvedValue(MOCK_HOLD);
    bookingsApi.holdCoupons.mockResolvedValue([]);
    paymentsApi.createOrder.mockResolvedValue({
      orderId: 'order_test_123',
      bookingId: 42,
      bookingRef: 'GK-2026-999999',
      amount: 2016000,
      currency: 'INR',
      simulated: true,
    });
    paymentsApi.devCheckout.mockResolvedValue({
      razorpay_order_id: 'order_test_123',
      razorpay_payment_id: 'pay_test_789',
      razorpay_signature: 'sig_valid',
    });
    paymentsApi.verify.mockResolvedValue({
      booking: { id: 42, bookingRef: 'GK-2026-999999', status: 'CONFIRMED' },
    });

    const route = { params: { holdId: 101 } };
    const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };

    const { getByText } = await render(<BookingReviewScreen route={route} navigation={navigation} />);

    await waitFor(() => expect(getByText('Pay now')).toBeTruthy());
    fireEvent.press(getByText('Pay now'));

    await waitFor(() => expect(getByText('Simulate successful payment')).toBeTruthy());
    fireEvent.press(getByText('Simulate successful payment'));

    await waitFor(() => expect(paymentsApi.devCheckout).toHaveBeenCalledWith('order_test_123', 'success'));
    await waitFor(() =>
      expect(paymentsApi.verify).toHaveBeenCalledWith({
        razorpay_order_id: 'order_test_123',
        razorpay_payment_id: 'pay_test_789',
        razorpay_signature: 'sig_valid',
      })
    );
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('BookingConfirmation', {
        booking: { id: 42, bookingRef: 'GK-2026-999999', status: 'CONFIRMED' },
        bookingId: 42,
      })
    );
  });

  test('displays pet summary in guest details card when pets are in hold', async () => {
    const holdWithPets = {
      ...MOCK_HOLD,
      petsCount: 2,
      guestDetails: {
        ...MOCK_HOLD.guestDetails,
        pets: [
          { name: 'Bruno', breed: 'Labrador' },
          { name: 'Bella', breed: 'Golden Retriever' },
        ],
      },
    };
    bookingsApi.hold.mockResolvedValue(holdWithPets);
    bookingsApi.holdCoupons.mockResolvedValue([]);

    const route = { params: { holdId: 101 } };
    const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };

    const { getByText } = await render(<BookingReviewScreen route={route} navigation={navigation} />);

    await waitFor(() => expect(getByText('🐾 Pets:')).toBeTruthy());
    expect(getByText('1) Bruno (Labrador), 2) Bella (Golden Retriever)')).toBeTruthy();
  });
});
