/**
 * Contract tests for the thin API wrapper modules: each wrapper must call the right HTTP method/path
 * and unwrap the right field from the response body. These are pure mocked-contract tests -- they prove
 * the wrapper code is internally consistent with the shapes verified LIVE against production earlier in
 * this session (see the session's diagnostic notes), not fresh proof the backend itself behaves this way.
 */
jest.mock('../../src/api/client.js', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(), patch: jest.fn() },
}));

import { api } from '../../src/api/client.js';
import { hotelsApi } from '../../src/api/hotelsApi.js';
import { bookingsApi } from '../../src/api/bookingsApi.js';
import { paymentsApi } from '../../src/api/paymentsApi.js';
import { wishlistApi } from '../../src/api/wishlistApi.js';

beforeEach(() => jest.clearAllMocks());

describe('hotelsApi', () => {
  test('search() calls GET /hotels/search with the given params and returns the body as-is (items/total)', async () => {
    const body = { items: [{ id: 1 }], total: 1 };
    api.get.mockResolvedValue({ data: body });
    const result = await hotelsApi.search({ destination: 'mumbai', checkIn: '2026-11-12', checkOut: '2026-11-14' });
    expect(api.get).toHaveBeenCalledWith('/hotels/search', { params: { destination: 'mumbai', checkIn: '2026-11-12', checkOut: '2026-11-14' }, signal: undefined });
    expect(result).toBe(body);
  });

  test('search() forwards an AbortSignal so a screen can cancel a stale request', async () => {
    api.get.mockResolvedValue({ data: { items: [], total: 0 } });
    const controller = new AbortController();
    await hotelsApi.search({ destination: 'mumbai' }, { signal: controller.signal });
    expect(api.get).toHaveBeenCalledWith('/hotels/search', { params: { destination: 'mumbai' }, signal: controller.signal });
  });

  test('hotel() calls GET /hotels/:ref and unwraps response.data.hotel', async () => {
    const hotel = { id: 1, name: 'Abbot Hotel' };
    api.get.mockResolvedValue({ data: { hotel } });
    const result = await hotelsApi.hotel('abbot-hotel-navi-mumbai');
    expect(api.get).toHaveBeenCalledWith('/hotels/abbot-hotel-navi-mumbai');
    expect(result).toBe(hotel);
  });

  test('availability() calls GET /hotels/:ref/availability with params and returns the body as-is', async () => {
    const body = { roomTypes: [] };
    api.get.mockResolvedValue({ data: body });
    const result = await hotelsApi.availability('abbot-hotel-navi-mumbai', { checkIn: '2026-11-12', checkOut: '2026-11-14', occ: '2' });
    expect(api.get).toHaveBeenCalledWith('/hotels/abbot-hotel-navi-mumbai/availability', { params: { checkIn: '2026-11-12', checkOut: '2026-11-14', occ: '2' } });
    expect(result).toBe(body);
  });

  test('suggestDestinations() unwraps response.data.items', async () => {
    const items = [{ type: 'CITY', label: 'Mumbai' }];
    api.get.mockResolvedValue({ data: { items } });
    const result = await hotelsApi.suggestDestinations('Mumbai');
    expect(api.get).toHaveBeenCalledWith('/destinations/search', { params: { q: 'Mumbai' }, signal: undefined });
    expect(result).toBe(items);
  });

  test('amenities() unwraps response.data.amenities', async () => {
    const amenities = [{ code: 'WIFI', name: 'Free WiFi' }];
    api.get.mockResolvedValue({ data: { amenities } });
    const result = await hotelsApi.amenities();
    expect(api.get).toHaveBeenCalledWith('/amenities');
    expect(result).toBe(amenities);
  });
});

describe('bookingsApi', () => {
  test('createHold() posts to /booking/holds and unwraps response.data.hold', async () => {
    const hold = { id: 99, status: 'HELD' };
    api.post.mockResolvedValue({ data: { hold } });
    const input = { hotelId: 1, roomTypeId: 2, ratePlanId: 3, checkIn: '2026-11-12', checkOut: '2026-11-14', rooms: 1, occupancy: [{ adults: 2, childAges: [] }] };
    const result = await bookingsApi.createHold(input);
    expect(api.post).toHaveBeenCalledWith('/booking/holds', input);
    expect(result).toBe(hold);
  });

  test('hold() unwraps response.data.hold, including its quote', async () => {
    const hold = { id: 99, quote: { totals: { total: 500000 } } };
    api.get.mockResolvedValue({ data: { hold } });
    const result = await bookingsApi.hold(99);
    expect(api.get).toHaveBeenCalledWith('/booking/holds/99');
    expect(result).toBe(hold);
  });

  test('myTrips() calls GET /my-bookings with the tab param and returns the body as-is (items)', async () => {
    const body = { items: [{ id: 1, bookingRef: 'GK-1' }] };
    api.get.mockResolvedValue({ data: body });
    const result = await bookingsApi.myTrips('upcoming');
    expect(api.get).toHaveBeenCalledWith('/my-bookings', { params: { tab: 'upcoming' } });
    expect(result).toBe(body);
  });

  test('booking() unwraps response.data.booking (the full booking DTO)', async () => {
    const booking = { id: 1, bookingRef: 'GK-1', amounts: { total: 500000 } };
    api.get.mockResolvedValue({ data: { booking } });
    const result = await bookingsApi.booking(1);
    expect(api.get).toHaveBeenCalledWith('/bookings/1');
    expect(result).toBe(booking);
  });

  test('cancel() posts to /bookings/:id/cancel and unwraps response.data.booking', async () => {
    const booking = { id: 1, status: 'CANCELLED' };
    api.post.mockResolvedValue({ data: { booking } });
    const result = await bookingsApi.cancel(1);
    expect(api.post).toHaveBeenCalledWith('/bookings/1/cancel', {});
    expect(result).toBe(booking);
  });
});

describe('paymentsApi', () => {
  test('config() returns the body as-is (keyId/simulated/checkoutScriptUrl)', async () => {
    const body = { simulated: true, keyId: null, checkoutScriptUrl: null };
    api.get.mockResolvedValue({ data: body });
    const result = await paymentsApi.config();
    expect(api.get).toHaveBeenCalledWith('/payments/config');
    expect(result).toBe(body);
  });

  test('createOrder() posts { holdId } and returns the real order shape (orderId/amount/simulated)', async () => {
    const order = { orderId: 'order_1', amount: 500000, currency: 'INR', simulated: true, bookingId: 1 };
    api.post.mockResolvedValue({ data: order });
    const result = await paymentsApi.createOrder(99);
    expect(api.post).toHaveBeenCalledWith('/payments/create-order', { holdId: 99 });
    expect(result).toBe(order);
  });

  test('verify() posts the razorpay payload and returns { status, booking }', async () => {
    const body = { status: 'CONFIRMED', booking: { id: 1 } };
    api.post.mockResolvedValue({ data: body });
    const payload = { razorpay_order_id: 'o', razorpay_payment_id: 'p', razorpay_signature: 's' };
    const result = await paymentsApi.verify(payload);
    expect(api.post).toHaveBeenCalledWith('/payments/verify', payload);
    expect(result).toBe(body);
  });

  test('devCheckout() posts { razorpayOrderId, outcome } and returns the razorpay-shaped mock fields', async () => {
    const body = { razorpay_order_id: 'o', razorpay_payment_id: 'p', razorpay_signature: 's' };
    api.post.mockResolvedValue({ data: body });
    const result = await paymentsApi.devCheckout('o', 'success');
    expect(api.post).toHaveBeenCalledWith('/payments/dev/checkout', { razorpayOrderId: 'o', outcome: 'success' });
    expect(result).toBe(body);
  });
});

describe('wishlistApi', () => {
  test('list() unwraps response.data.items', async () => {
    const items = [{ id: 1, name: 'Abbot Hotel' }];
    api.get.mockResolvedValue({ data: { items } });
    const result = await wishlistApi.list();
    expect(api.get).toHaveBeenCalledWith('/wishlist');
    expect(result).toBe(items);
  });

  test('add() posts { hotelId } to /wishlist', async () => {
    api.post.mockResolvedValue({ data: { ok: true } });
    await wishlistApi.add(42);
    expect(api.post).toHaveBeenCalledWith('/wishlist', { hotelId: 42 });
  });

  test('remove() deletes /wishlist/:hotelId', async () => {
    api.delete.mockResolvedValue({ data: {} });
    await wishlistApi.remove(42);
    expect(api.delete).toHaveBeenCalledWith('/wishlist/42');
  });
});
