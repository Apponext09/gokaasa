import { resolveBaseUrl, PRODUCTION_API_URL } from '../api/client.js';

/**
 * Dynamically resolves any image path into a fully qualified URL for React Native / Expo Image.
 * - If the URL is already absolute (e.g., https://images.unsplash.com/... or https://res.cloudinary.com/...), it is returned as-is.
 * - If the URL is a relative media path (e.g., /media/hotels/36/... or /media/rooms/...), it prepends the backend host
 *   derived dynamically from the active EXPO_PUBLIC_API_URL (e.g. http://192.168.1.3:4000 or https://gokaasa.com).
 * - Never hardcodes any hostname, IP, or port.
 */
export function resolveImageUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // Already an absolute URL with scheme
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Derive origin from the resolved API base URL (stripping trailing /api)
  const apiBase = resolveBaseUrl(process.env.EXPO_PUBLIC_API_URL);
  const origin = (apiBase || PRODUCTION_API_URL).replace(/\/api\/?$/i, '');
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;

  return `${origin}${path}`;
}
