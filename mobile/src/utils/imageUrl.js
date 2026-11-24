import { resolveBaseUrl, PRODUCTION_API_URL } from '../api/client.js';

/** Curated, reliable destination photos for popular cities when the backend has no uploaded cover or when testing against an environment without images */
export const DESTINATION_FALLBACK_IMAGES = {
  'goa': 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=800&q=80',
  'mumbai': 'https://images.unsplash.com/photo-1570168007204-dfb528c6958f?auto=format&fit=crop&w=800&q=80',
  'navi-mumbai': 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
  'delhi': 'https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=800&q=80',
  'bengaluru': 'https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&w=800&q=80',
  'bangalore': 'https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&w=800&q=80',
  'jaipur': 'https://images.unsplash.com/photo-1477587458883-47145ed94245?auto=format&fit=crop&w=800&q=80',
  'thane': 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80',
  'pune': 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80',
  'ahilyanagar': 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
  'ahmadnagar': 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
  'kalyan': 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
  'dombivli': 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
  'dombivli-east': 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
};

export const DEFAULT_DESTINATION_IMAGE = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80';

/**
 * Resolves a reliable image URL for a destination card.
 * Priority:
 * 1. Backend-provided imageUrl (resolved through resolveImageUrl)
 * 2. Curated city photo based on destination slug / label
 * 3. Default high-resolution travel destination photo
 * Guarantees every destination card on mobile displays a real photo, matching web.
 */
export function resolveDestinationImage(item) {
  if (!item) return DEFAULT_DESTINATION_IMAGE;
  const resolved = resolveImageUrl(item.imageUrl);
  if (resolved) return resolved;
  const slug = (item.destination || item.label || '').toLowerCase().trim().replace(/[\s_]+/g, '-');
  return DESTINATION_FALLBACK_IMAGES[slug] || DEFAULT_DESTINATION_IMAGE;
}

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
