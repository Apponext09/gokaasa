import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import MyTripsScreen from '../../src/screens/MyTripsScreen.js';

const mockFile = { exists: false, uri: 'file:///cache/GK-TRIP-1-invoice.pdf', delete: jest.fn(), write: jest.fn() };

jest.mock('../../src/api/bookingsApi.js', () => ({
  bookingsApi: {
    myTrips: jest.fn(),
    invoice: jest.fn(),
    checkExtension: jest.fn(),
    createExtensionOrder: jest.fn(),
    confirmExtension: jest.fn(),
  },
}));

jest.mock('../../src/api/reviewsApi.js', () => ({
  reviewsApi: {
    eligibility: jest.fn(() => Promise.resolve({ eligible: true })),
    create: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('expo-file-system', () => ({
  File: jest.fn(() => mockFile),
  Paths: { cache: '/cache' },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

let mockAuthState = { isAuthenticated: true, user: { id: 1, email: 'asha@example.com', firstName: 'Asha' } };
jest.mock('../../src/context/AuthContext.js', () => ({
  useAuth: () => mockAuthState,
}));

import { bookingsApi } from '../../src/api/bookingsApi.js';
import * as Sharing from 'expo-sharing';

const SAMPLE_UPCOMING_TRIPS = [
  {
    id: 10,
    bookingRef: 'GK-2026-000010',
    status: 'CONFIRMED',
    hotel: { name: 'Goa Coastal Resort', city: 'Goa', imageUrl: 'https://example.com/hotel.jpg' },
    roomName: 'Deluxe Sea View',
    checkIn: '2026-12-01',
    checkOut: '2026-12-05',
    totalMinor: 1200000,
    currency: 'INR',
  },
];

describe('MyTripsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = { isAuthenticated: true, user: { id: 1, email: 'asha@example.com', firstName: 'Asha' } };
  });

  test('renders "My Trips" screen title and navigation tabs', async () => {
    bookingsApi.myTrips.mockResolvedValue({ items: [] });
    await render(<MyTripsScreen navigation={{ navigate: jest.fn() }} />);

    expect(screen.getByText('My Trips')).toBeTruthy();
    expect(screen.getByText('Upcoming')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('Cancelled')).toBeTruthy();
  });

  test('displays trip cards with View details, Invoice, and Extend buttons for confirmed upcoming trips', async () => {
    bookingsApi.myTrips.mockResolvedValue({ items: SAMPLE_UPCOMING_TRIPS });
    const navigation = { navigate: jest.fn() };
    await render(<MyTripsScreen navigation={navigation} />);

    expect(await screen.findByText('Goa Coastal Resort')).toBeTruthy();
    expect(screen.getByText('GK-2026-000010')).toBeTruthy();
    expect(screen.getByText('Invoice')).toBeTruthy();
    expect(screen.getByText('Extend')).toBeTruthy();
    expect(screen.getByText('View details')).toBeTruthy();

    // Tapping "View details" navigates to BookingDetails
    fireEvent.press(screen.getByText('View details'));
    expect(navigation.navigate).toHaveBeenCalledWith('BookingDetails', { bookingId: 10 });
  });

  test('tapping Invoice downloads the PDF and invokes expo-sharing', async () => {
    bookingsApi.myTrips.mockResolvedValue({ items: SAMPLE_UPCOMING_TRIPS });
    bookingsApi.invoice.mockResolvedValue(new ArrayBuffer(16));
    await render(<MyTripsScreen navigation={{ navigate: jest.fn() }} />);

    const invoiceBtn = await screen.findByText('Invoice');
    fireEvent.press(invoiceBtn);

    await waitFor(() => expect(bookingsApi.invoice).toHaveBeenCalledWith(10));
    await waitFor(() =>
      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        mockFile.uri,
        expect.objectContaining({ mimeType: 'application/pdf' })
      )
    );
  });

  test('tapping Extend opens the ExtendStayModal for this trip', async () => {
    bookingsApi.myTrips.mockResolvedValue({ items: SAMPLE_UPCOMING_TRIPS });
    bookingsApi.checkExtension.mockResolvedValue({
      available: true,
      extraNights: 1,
      currency: 'INR',
      subtotalMinor: 300000,
      taxesMinor: 36000,
      totalMinor: 336000,
    });

    await render(<MyTripsScreen navigation={{ navigate: jest.fn() }} />);

    const extendBtn = await screen.findByText('Extend');
    fireEvent.press(extendBtn);

    expect(await screen.findByText('Extend your stay')).toBeTruthy();
  });

  test('shows empty state when user is not authenticated', async () => {
    mockAuthState = { isAuthenticated: false, user: null };
    await render(<MyTripsScreen navigation={{ navigate: jest.fn() }} />);

    expect(await screen.findByText('Sign in to see your trips')).toBeTruthy();
    expect(screen.getByText('Sign in')).toBeTruthy();
  });

  test('completed trip card shows Review button near Invoice and tapping it opens WriteReviewModal', async () => {
    bookingsApi.myTrips.mockResolvedValue({ items: SAMPLE_UPCOMING_TRIPS });
    const { getByText, findByText } = await render(<MyTripsScreen navigation={{ navigate: jest.fn() }} />);

    // Switch to Completed tab
    fireEvent.press(getByText('Completed'));

    expect(await findByText('Review', {}, { timeout: 7000 })).toBeTruthy();
    expect(getByText('Invoice')).toBeTruthy();

    // Tapping Review opens the WriteReviewModal
    fireEvent.press(getByText('Review'));
    expect(await findByText('Write a review', {}, { timeout: 7000 })).toBeTruthy();
  });
});
