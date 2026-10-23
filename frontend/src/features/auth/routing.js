/**
 * Pure post-authentication routing decisions, kept dependency-free (no JSX, no React) so they can be
 * unit-tested directly with the project's existing node:test convention -- see tests/unit/authRouting.test.js.
 * Re-exported from AuthContext.jsx and components/shared/index.jsx so every existing import keeps working.
 */

const ADMIN_ROLES = ['ADMIN', 'HOTEL_MANAGER'];

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
  if (isApprovedStaff(user)) return '/admin/dashboard';
  if (user?.roles?.includes('HOTEL_OWNER')) return '/partner/status';
  return '/';
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
