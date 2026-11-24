import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { HotelCard } from '../../src/components/HotelCard.js';

jest.mock('../../src/context/AuthContext.js', () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));
jest.mock('../../src/context/WishlistContext.js', () => ({
  useWishlist: () => ({ isWishlisted: () => false, toggle: jest.fn() }),
}));

describe('HotelCard', () => {
  const onPress = jest.fn();
  const onQuickReserve = jest.fn();

  beforeAll(() => {
    jest.spyOn(Animated, 'spring').mockReturnValue({ start: (cb) => cb && cb({ finished: true }) });
  });

  afterAll(() => {
    Animated.spring.mockRestore?.();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders hotel with bestOffer and both Quick Reserve and View buttons', async () => {
    const hotel = {
      id: 21,
      name: 'Ahilya Grand Hotel',
      slug: 'ahilya-grand-hotel',
      city: 'Ahilyanagar',
      bestOffer: {
        roomTypeId: 101,
        roomName: 'Deluxe Suite',
        mealPlan: 'ROOM_ONLY',
        freeCancellation: true,
        pricePerNightMinor: 250000,
        finalTotalMinor: 250000,
        nights: 1,
      },
    };

    const { getByText, getByLabelText } = await render(
      <HotelCard
        hotel={hotel}
        onPress={onPress}
        onQuickReserve={onQuickReserve}
      />
    );

    expect(getByText('Ahilya Grand Hotel')).toBeTruthy();
    expect(getByText('Quick Reserve')).toBeTruthy();
    expect(getByText('View')).toBeTruthy();
    expect(getByText('₹2,500')).toBeTruthy();
  });

  test('renders hotel with simple price and both Quick Reserve and View buttons', async () => {
    const hotel = {
      id: 22,
      name: 'Fort View Residency',
      slug: 'fort-view-residency',
      city: 'Ahilyanagar',
      price: {
        amountMinor: 180000,
      },
    };

    const { getByText } = await render(
      <HotelCard
        hotel={hotel}
        onPress={onPress}
        onQuickReserve={onQuickReserve}
      />
    );

    expect(getByText('Fort View Residency')).toBeTruthy();
    expect(getByText('Quick Reserve')).toBeTruthy();
    expect(getByText('View')).toBeTruthy();
    expect(getByText('₹1,800')).toBeTruthy();
  });

  test('renders hotel with no offer and no price (e.g. v star, sai inn) with Sold out fallback and View button', async () => {
    const hotel = {
      id: 38,
      name: 'v star',
      slug: 'v-star-navi-mumbai',
      city: 'navi mumbai',
      price: null,
      bestOffer: null,
    };

    const { getByText, queryByText, getByLabelText } = await render(
      <HotelCard
        hotel={hotel}
        onPress={onPress}
        onQuickReserve={onQuickReserve}
      />
    );

    expect(getByText('v star')).toBeTruthy();
    // Quick Reserve should NOT be shown because there is no bookable room/price
    expect(queryByText('Quick Reserve')).toBeNull();
    // Sold out badge and Currently unavailable notice should be shown
    expect(getByText('Sold out')).toBeTruthy();
    expect(getByText('Currently unavailable')).toBeTruthy();
    // View button SHOULD be shown so the card never looks empty
    const viewBtn = getByLabelText('View details for v star');
    expect(viewBtn).toBeTruthy();
  });

  test('tapping View button calls onPress on unavailable hotel', async () => {
    const hotel = {
      id: 38,
      name: 'v star',
      slug: 'v-star-navi-mumbai',
      city: 'navi mumbai',
      price: null,
      bestOffer: null,
    };

    const { getByLabelText } = await render(
      <HotelCard
        hotel={hotel}
        onPress={onPress}
        onQuickReserve={onQuickReserve}
      />
    );

    const viewBtn = getByLabelText('View details for v star');
    fireEvent(viewBtn, 'press');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('renders hotel with variant="similar" (You might also like) without price, without Sold out, and with View button', async () => {
    const hotel = {
      id: 45,
      name: 'hotel dhaba',
      slug: 'hotel-dhaba-navi-mumbai',
      city: 'Navi Mumbai',
      price: null,
      bestOffer: null,
    };

    const { getByText, queryByText, getByLabelText } = await render(
      <HotelCard
        hotel={hotel}
        variant="similar"
        onPress={onPress}
      />
    );

    expect(getByText('hotel dhaba')).toBeTruthy();
    // Neither price nor quick reserve should be shown
    expect(queryByText('Quick Reserve')).toBeNull();
    expect(queryByText('/ night')).toBeNull();
    // Sold out or Currently unavailable should NOT be shown
    expect(queryByText('Sold out')).toBeNull();
    expect(queryByText('Currently unavailable')).toBeNull();
    // View button SHOULD be shown
    const viewBtn = getByLabelText('View details for hotel dhaba');
    expect(viewBtn).toBeTruthy();

    fireEvent(viewBtn, 'press');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test.each([1, 2, 3])('renders urgency badge "Only %i left" when teaser card has roomsLeft <= 3', async (count) => {
    const hotel = {
      id: 32,
      name: 'sam tech',
      slug: 'sam-tech',
      city: 'Navi Mumbai',
      roomsLeft: count,
      price: {
        amountMinor: 1120000,
      },
    };

    const { getByText } = await render(
      <HotelCard
        hotel={hotel}
        onPress={onPress}
      />
    );

    expect(getByText(`Only ${count} left`)).toBeTruthy();
  });

  test('does not render urgency badge when teaser card has roomsLeft > 3', async () => {
    const hotel = {
      id: 26,
      name: 'Green Leaf Resort',
      slug: 'green-leaf-resort',
      city: 'Ahilyanagar',
      roomsLeft: 8,
      price: {
        amountMinor: 297360,
      },
    };

    const { queryByText } = await render(
      <HotelCard
        hotel={hotel}
        onPress={onPress}
      />
    );

    expect(queryByText(/Only \d+ left/)).toBeNull();
  });

  test('renders urgency badge when search card has offer.roomsLeft <= 3', async () => {
    const hotel = {
      id: 21,
      name: 'Ahilya Grand Hotel',
      slug: 'ahilya-grand-hotel',
      city: 'Ahilyanagar',
      bestOffer: {
        roomTypeId: 101,
        roomName: 'Deluxe Suite',
        mealPlan: 'ROOM_ONLY',
        freeCancellation: true,
        pricePerNightMinor: 250000,
        finalTotalMinor: 250000,
        nights: 1,
        roomsLeft: 2,
      },
    };

    const { getByText } = await render(
      <HotelCard
        hotel={hotel}
        onPress={onPress}
      />
    );

    expect(getByText('Only 2 left')).toBeTruthy();
  });

  test('renders pet friendly badge when hotel allows pets', async () => {
    const hotel = {
      id: 25,
      name: 'Pet Friendly Resort',
      slug: 'pet-friendly-resort',
      city: 'Goa',
      petsAllowed: true,
    };

    const { getByText } = await render(
      <HotelCard
        hotel={hotel}
        onPress={onPress}
      />
    );

    expect(getByText('🐾 Pet friendly')).toBeTruthy();
  });
});
