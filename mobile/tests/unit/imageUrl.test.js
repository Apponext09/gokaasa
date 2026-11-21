import { resolveImageUrl } from '../../src/utils/imageUrl.js';

describe('resolveImageUrl', () => {
  const originalEnv = process.env.EXPO_PUBLIC_API_URL;

  afterEach(() => {
    process.env.EXPO_PUBLIC_API_URL = originalEnv;
  });

  test('returns null for falsy, empty or non-string inputs', () => {
    expect(resolveImageUrl(null)).toBeNull();
    expect(resolveImageUrl(undefined)).toBeNull();
    expect(resolveImageUrl('')).toBeNull();
    expect(resolveImageUrl('   ')).toBeNull();
    expect(resolveImageUrl(12345)).toBeNull();
  });

  test('preserves absolute URLs (e.g. Unsplash, external CDNs)', () => {
    const unsplashUrl = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80';
    expect(resolveImageUrl(unsplashUrl)).toBe(unsplashUrl);

    const httpUrl = 'http://example.com/hotel.jpg';
    expect(resolveImageUrl(httpUrl)).toBe(httpUrl);
  });

  test('dynamically prepends API origin to relative media paths', () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.3:4000/api';
    expect(resolveImageUrl('/media/hotels/36/test.png')).toBe('http://192.168.1.3:4000/media/hotels/36/test.png');
    expect(resolveImageUrl('media/rooms/15/room.jpg')).toBe('http://192.168.1.3:4000/media/rooms/15/room.jpg');
  });

  test('works with production domain dynamically without hardcoding', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://gokaasa.com/api';
    expect(resolveImageUrl('/media/hotels/36/test.png')).toBe('https://gokaasa.com/media/hotels/36/test.png');
  });

  test('works with emulator IP dynamically', () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://10.0.2.2:4000/api';
    expect(resolveImageUrl('/media/hotels/20/img.jpg')).toBe('http://10.0.2.2:4000/media/hotels/20/img.jpg');
  });
});
