import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import BookingDetailsScreen from '../../src/screens/BookingDetailsScreen.js';

const mockFile = { exists: false, uri: 'file:///cache/GK-1-invoice.pdf', delete: jest.fn(), write: jest.fn(), create: jest.fn() };

jest.mock('../../src/api/bookingsApi.js', () => ({
  bookingsApi: { booking: jest.fn(), cancel: jest.fn(), invoice: jest.fn() },
}));
jest.mock('expo-file-system', () => ({
  File: jest.fn(() => mockFile),
  Paths: { cache: '/cache' },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

import { bookingsApi } from '../../src/api/bookingsApi.js';
import * as Sharing from 'expo-sharing';

const CONFIRMED_BOOKING = {
  id: 1,
  bookingRef: 'GK-2026-000001',
  status: 'CONFIRMED',
  holdId: 7,
  hotel: { name: 'Abbot Hotel', address: 'Ganesh Mandir Marg, Navi Mumbai' },
  stay: { checkIn: '2026-11-12', checkOut: '2026-11-14', nights: 2 },
  rooms: [{ quantity: 1, name: 'Deluxe Room', ratePlanName: 'Room only' }],
  primaryContact: { firstName: 'Asha', lastName: 'Rao', email: 'asha@example.com', mobile: '+919876500000' },
  amounts: { subtotal: 500000, discount: 0, taxes: 50000, fees: 0, couponDiscount: 0, total: 550000, paid: 550000, currency: 'INR' },
  cancellation: null,
  specialRequest: null,
};

describe('BookingDetailsScreen invoice download', () => {
  beforeEach(() => jest.clearAllMocks());

  test('a CONFIRMED booking shows "Download invoice"; tapping it fetches the real PDF and opens the share sheet', async () => {
    bookingsApi.booking.mockResolvedValue(CONFIRMED_BOOKING);
    bookingsApi.invoice.mockResolvedValue(new ArrayBuffer(8));
    await render(<BookingDetailsScreen route={{ params: { bookingId: 1 } }} />);

    const button = await screen.findByText('Download invoice');
    fireEvent.press(button);

    await waitFor(() => expect(bookingsApi.invoice).toHaveBeenCalledWith(1));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledWith(mockFile.uri, expect.objectContaining({ mimeType: 'application/pdf' })));
  });

  test('a PAYMENT_PENDING booking (nothing real to invoice yet) shows no invoice action, matching the website\'s own gate', async () => {
    bookingsApi.booking.mockResolvedValue({ ...CONFIRMED_BOOKING, status: 'PAYMENT_PENDING' });
    await render(<BookingDetailsScreen route={{ params: { bookingId: 1 } }} />);

    await waitFor(() => expect(screen.queryByText('Abbot Hotel')).toBeTruthy());
    expect(screen.queryByText('Download invoice')).toBeNull();
    expect(bookingsApi.invoice).not.toHaveBeenCalled();
  });
});

describe('BookingDetailsScreen payment recovery', () => {
  beforeEach(() => jest.clearAllMocks());

  test('a PAYMENT_PENDING booking with a real holdId shows "Resume payment", which navigates to Payment with that hold', async () => {
    bookingsApi.booking.mockResolvedValue({ ...CONFIRMED_BOOKING, status: 'PAYMENT_PENDING', holdId: 7 });
    const navigation = { navigate: jest.fn() };
    await render(<BookingDetailsScreen route={{ params: { bookingId: 1 } }} navigation={navigation} />);

    const button = await screen.findByText('Resume payment');
    fireEvent.press(button);

    expect(navigation.navigate).toHaveBeenCalledWith('Payment', { holdId: 7, hotelName: 'Abbot Hotel' });
  });

  test('a CONFIRMED booking never shows "Resume payment", even though it still has a holdId on record', async () => {
    bookingsApi.booking.mockResolvedValue(CONFIRMED_BOOKING);
    await render(<BookingDetailsScreen route={{ params: { bookingId: 1 } }} navigation={{ navigate: jest.fn() }} />);

    await waitFor(() => expect(screen.queryByText('Abbot Hotel')).toBeTruthy());
    expect(screen.queryByText('Resume payment')).toBeNull();
  });
});
