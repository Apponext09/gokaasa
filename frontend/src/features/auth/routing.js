/**
 * Pure post-authentication routing decisions, kept dependency-free (no JSX, no React) so they can be
 * unit-tested directly with the project's existing node:test convention -- see tests/unit/authRouting.test.js.
 * Re-exported from AuthContext.jsx and components/shared/index.jsx so every existing import keeps working.
 */

const ADMIN_ROLES = ['ADMIN', 'HOTEL_MANAGER', 'SALES_EXECUTIVE', 'HOTEL_ONBOARDING_EXECUTIVE', 'HOTEL_REVIEW_EXECUTIVE'];

/**
 * A HOTEL_OWNER reuses the same /admin/* surface as ADMIN/HOTEL_MANAGER, but only once their partner
 * application is APPROVED (the backend enforces this independently -- this is purely for routing).
 */
export function isApprovedStaff(user) {
  if (!user?.roles) return false;
  if (user.roles.some((role) => ADMIN_ROLES.includes(role))) return true;
  return user.roles.includes('HOTEL_OWNER') && user.partnerStatus === 'APPROVED';
}

export function homePathFor(user) {
  if (user?.roles?.includes('SALES_EXECUTIVE')) return '/admin/bookings';
  if (user?.roles?.includes('HOTEL_ONBOARDING_EXECUTIVE')) return '/admin/hotels';
  if (user?.roles?.includes('HOTEL_REVIEW_EXECUTIVE')) return '/admin/hotel-reviews';
  if (isApprovedStaff(user)) return '/admin/dashboard';
  if (user?.roles?.includes('HOTEL_OWNER')) return '/partner/status';
  return '/';
}

const SALES_PATH = /^\/admin\/(?:bookings(?:\/\d+)?|payments|refunds|invoices|offers(?:\/new|\/\d+)?|profile|notifications)$/;
const ONBOARDING_PATH = /^\/admin\/(?:hotels(?:\/new|\/onboarding(?:\/\d+\/review)?|\/\d+(?:\/rooms(?:\/new|\/\d+)?)?)?|profile|notifications)$/;
const REVIEW_PATH = /^\/admin\/(?:hotel-reviews|hotels\/\d+(?:\/rooms\/\d+)?|profile|notifications)$/;

export function canAccessAdminPath(user, pathname) {
  if (user?.roles?.includes('ADMIN') || user?.roles?.includes('HOTEL_MANAGER')) return true;
  if (user?.roles?.includes('HOTEL_OWNER') && user.partnerStatus === 'APPROVED') return true;
  if (user?.roles?.includes('SALES_EXECUTIVE')) return SALES_PATH.test(pathname);
  if (user?.roles?.includes('HOTEL_ONBOARDING_EXECUTIVE')) return ONBOARDING_PATH.test(pathname);
  if (user?.roles?.includes('HOTEL_REVIEW_EXECUTIVE')) return REVIEW_PATH.test(pathname);
  return false;
}

/**
 * Where to send someone right after they log in. `stateFrom` (RequireAuth's `location.state.from`,
 * or a Link's own `state.from`) is only honored when this user's canonical home is the generic
 * customer homepage -- resuming a specific page (checkout, a wishlist prompt) is useful there. For
 * every other role, a stale "from" (e.g. an admin's session expired on some other admin page, or even
 * a customer-only page) must never override their real canonical workspace -- that was the bug: an
 * admin's login could land back on whatever unrelated page redirected them to /login instead of
 * /admin/dashboard.
 */
export function resolvePostLoginTarget(user, stateFrom) {
  const canonical = homePathFor(user);
  return canonical === '/' ? (stateFrom ?? canonical) : canonical;
}
