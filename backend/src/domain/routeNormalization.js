/**
 * Maps a frontend pathname to a safe, bounded route template and a friendly label for the admin
 * presence dashboard. Never echoes a raw path back: an unrecognized path (which could carry an id or
 * other detail not meant for display) always collapses to the generic 'other' template.
 */

const MAX_INPUT_LENGTH = 300;

const STATIC_ROUTES = {
  '/': 'Home',
  '/destinations': 'Destinations',
  '/offers': 'Offers',
  '/about': 'About',
  '/contact': 'Contact',
  '/hotels/nearby': 'Nearby Hotels',
  '/my-trips': 'My Trips',
  '/wishlist': 'Wishlist',
  '/profile': 'Profile',
  '/notifications': 'Notifications',
  '/login': 'Login',
  '/register': 'Register',
  '/forgot-password': 'Forgot Password',
  '/reset-password': 'Reset Password',
  '/booking/guest-details': 'Booking',
  '/booking/review': 'Booking Review',
};

const ADMIN_SEGMENT_LABELS = {
  dashboard: 'Admin · Dashboard',
  hotels: 'Admin · Hotels',
  bookings: 'Admin · Bookings',
  payments: 'Admin · Payments',
  refunds: 'Admin · Refunds',
  invoices: 'Admin · Invoices',
  offers: 'Admin · Offers',
  customers: 'Admin · Customers',
  reviews: 'Admin · Reviews',
  managers: 'Admin · Managers',
  reports: 'Admin · Reports',
  'audit-logs': 'Admin · Audit Logs',
  settings: 'Admin · Settings',
  profile: 'Admin · Profile',
  users: 'Admin · Users',
  notifications: 'Admin · Notifications',
};

const DYNAMIC_ROUTES = [
  { test: /^\/hotels\/[^/]+\/[^/]+$/, route: '/hotels/:citySlug/:hotelSlug', label: 'Hotel Details' },
  { test: /^\/hotels\/[^/]+$/, route: '/hotels/:destination', label: 'Hotel Search' },
  { test: /^\/booking\/confirmation\/[^/]+$/, route: '/booking/confirmation/:bookingId', label: 'Booking Confirmation' },
  { test: /^\/my-trips\/[^/]+$/, route: '/my-trips/:bookingId', label: 'Trip Details' },
];

export const UNKNOWN_ROUTE = { route: 'unknown', label: 'Not available' };
const OTHER_ROUTE = { route: 'other', label: 'Other' };

/** @returns {{ route: string, label: string }} */
export function normalizeRoute(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.length === 0) return UNKNOWN_ROUTE;

  // Defensive: the client is only ever asked to send a bare pathname, but never trust that it did.
  let path = rawPath.split('?')[0].split('#')[0].slice(0, MAX_INPUT_LENGTH);
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

  if (STATIC_ROUTES[path]) return { route: path, label: STATIC_ROUTES[path] };

  const adminMatch = path.match(/^\/admin(?:\/([a-z-]+))?/);
  if (adminMatch) {
    const segment = adminMatch[1];
    const label = segment ? ADMIN_SEGMENT_LABELS[segment] ?? 'Admin · Dashboard' : 'Admin · Dashboard';
    return { route: segment ? `/admin/${segment}` : '/admin', label };
  }

  for (const rule of DYNAMIC_ROUTES) {
    if (rule.test.test(path)) return { route: rule.route, label: rule.label };
  }

  return OTHER_ROUTE;
}
