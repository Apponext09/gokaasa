import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAccessAdminPath, isApprovedStaff, homePathFor, resolvePostLoginTarget } from '../../src/features/auth/routing.js';

const consoleUser = (role, profile, extra = {}) => ({
  roles: [role],
  permissions: ['console.access', profile],
  ...extra,
});

test('isApprovedStaff: ADMIN is always approved; HOTEL_OWNER requires approved partner status', () => {
  assert.equal(isApprovedStaff(consoleUser('ADMIN', 'console.full')), true);
  assert.equal(isApprovedStaff(consoleUser('HOTEL_OWNER', 'console.owner', { partnerStatus: 'APPROVED' })), true);
  assert.equal(isApprovedStaff(consoleUser('ADMIN', 'console.full', { partnerStatus: null })), true);
});

test('isApprovedStaff: a HOTEL_OWNER is staff only once approved', () => {
  assert.equal(isApprovedStaff(consoleUser('HOTEL_OWNER', 'console.owner', { partnerStatus: 'APPROVED' })), true);
  assert.equal(isApprovedStaff(consoleUser('HOTEL_OWNER', 'console.owner', { partnerStatus: 'PENDING_REVIEW' })), false);
  assert.equal(isApprovedStaff(consoleUser('HOTEL_OWNER', 'console.owner', { partnerStatus: 'REJECTED' })), false);
  assert.equal(isApprovedStaff(consoleUser('HOTEL_OWNER', 'console.owner', { partnerStatus: null })), false);
});

test('isApprovedStaff: a plain CUSTOMER, or no user at all, is never staff', () => {
  assert.equal(isApprovedStaff({ roles: ['CUSTOMER'] }), false);
  assert.equal(isApprovedStaff(null), false);
  assert.equal(isApprovedStaff(undefined), false);
});

test('homePathFor: canonical destination per role', () => {
  assert.equal(homePathFor(consoleUser('ADMIN', 'console.full')), '/admin/dashboard');
  assert.equal(homePathFor(consoleUser('HOTEL_OWNER', 'console.owner', { partnerStatus: 'APPROVED' })), '/admin/dashboard');
  assert.equal(homePathFor(consoleUser('HOTEL_OWNER', 'console.owner', { partnerStatus: 'PENDING_REVIEW' })), '/partner/status');
  assert.equal(homePathFor({ roles: ['CUSTOMER'] }), '/');
  assert.equal(homePathFor(consoleUser('SALES_EXECUTIVE', 'console.sales')), '/admin/bookings');
  assert.equal(homePathFor(consoleUser('HOTEL_ONBOARDING_EXECUTIVE', 'console.onboarding')), '/admin/hotels');
  assert.equal(homePathFor(consoleUser('HOTEL_REVIEW_EXECUTIVE', 'console.review')), '/admin/hotel-reviews');
});

test('specialized staff can open only their assigned console areas', () => {
  const sales = consoleUser('SALES_EXECUTIVE', 'console.sales');
  assert.equal(canAccessAdminPath(sales, '/admin/bookings/42'), true);
  assert.equal(canAccessAdminPath(sales, '/admin/offers/new'), true);
  assert.equal(canAccessAdminPath(sales, '/admin/hotels'), false);
  assert.equal(canAccessAdminPath(sales, '/admin/users'), false);

  const onboarding = consoleUser('HOTEL_ONBOARDING_EXECUTIVE', 'console.onboarding');
  assert.equal(canAccessAdminPath(onboarding, '/admin/hotels/onboarding/7/review'), true);
  assert.equal(canAccessAdminPath(onboarding, '/admin/hotels/35'), true);
  assert.equal(canAccessAdminPath(onboarding, '/admin/hotels/35/rooms'), true);
  assert.equal(canAccessAdminPath(onboarding, '/admin/hotels/35/rooms/new'), true);
  assert.equal(canAccessAdminPath(onboarding, '/admin/hotels/35/rooms/8'), true);
  assert.equal(canAccessAdminPath(onboarding, '/admin/bookings'), false);
  assert.equal(canAccessAdminPath(onboarding, '/admin/settings'), false);

  const reviewer = consoleUser('HOTEL_REVIEW_EXECUTIVE', 'console.review');
  assert.equal(canAccessAdminPath(reviewer, '/admin/hotel-reviews'), true);
  assert.equal(canAccessAdminPath(reviewer, '/admin/hotels/35'), true);
  assert.equal(canAccessAdminPath(reviewer, '/admin/hotels'), false);
  assert.equal(canAccessAdminPath(reviewer, '/admin/bookings'), false);
});

test('an approved hotel owner sees only its property operations, not internal administration', () => {
  const owner = consoleUser('HOTEL_OWNER', 'console.owner', { partnerStatus: 'APPROVED' });

  assert.equal(canAccessAdminPath(owner, '/admin/dashboard'), true);
  assert.equal(canAccessAdminPath(owner, '/admin/hotels'), true);
  assert.equal(canAccessAdminPath(owner, '/admin/hotels/onboarding'), true);
  assert.equal(canAccessAdminPath(owner, '/admin/hotels/new'), true);
  assert.equal(canAccessAdminPath(owner, '/admin/hotels/35/rooms/8'), true);
  assert.equal(canAccessAdminPath(owner, '/admin/bookings/42'), true);
  assert.equal(canAccessAdminPath(owner, '/admin/customers/7'), true);
  assert.equal(canAccessAdminPath(owner, '/admin/reports'), true);

  assert.equal(canAccessAdminPath(owner, '/admin/hotel-reviews'), false);
  assert.equal(canAccessAdminPath(owner, '/admin/managers'), false);
  assert.equal(canAccessAdminPath(owner, '/admin/offers'), false);
  assert.equal(canAccessAdminPath(owner, '/admin/settings'), false);
  assert.equal(canAccessAdminPath(owner, '/admin/users'), false);
});

test('a hotel owner without partner approval cannot open owner console pages', () => {
  const pendingOwner = consoleUser('HOTEL_OWNER', 'console.owner', { partnerStatus: 'PENDING_REVIEW' });
  assert.equal(canAccessAdminPath(pendingOwner, '/admin/dashboard'), false);
  assert.equal(canAccessAdminPath(pendingOwner, '/admin/hotels'), false);
});

// Regression coverage for the intermittent-admin-redirect bug: LoginPage used to prefer
// location.state.from over the canonical destination for every role, so an admin whose session
// expired on some other page (or even a customer-only page) would log back in and land there
// instead of the dashboard, instead of always reaching /admin/dashboard.
test('resolvePostLoginTarget: staff and partner roles always go to their canonical page, never a stale "from"', () => {
  assert.equal(resolvePostLoginTarget(consoleUser('ADMIN', 'console.full'), '/admin/bookings/42'), '/admin/dashboard');
  assert.equal(resolvePostLoginTarget(consoleUser('ADMIN', 'console.full'), '/profile'), '/admin/dashboard');
  assert.equal(resolvePostLoginTarget(consoleUser('ADMIN', 'console.full'), undefined), '/admin/dashboard');
  assert.equal(resolvePostLoginTarget(consoleUser('HOTEL_OWNER', 'console.owner', { partnerStatus: 'APPROVED' }), '/my-trips'), '/admin/dashboard');
  assert.equal(
    resolvePostLoginTarget(consoleUser('HOTEL_OWNER', 'console.owner', { partnerStatus: 'PENDING_REVIEW' }), '/admin/hotels'),
    '/partner/status',
  );
});

test('console access is controlled by permissions, not by the role name alone', () => {
  assert.equal(isApprovedStaff({ roles: ['ADMIN'], permissions: [] }), false);
  assert.equal(canAccessAdminPath({ roles: ['ADMIN'], permissions: [] }, '/admin/dashboard'), false);
  assert.equal(canAccessAdminPath(consoleUser('CUSTOM_ROLE', 'console.sales'), '/admin/bookings'), true);
});

test('resolvePostLoginTarget: a plain customer resumes a specific page when one is given, otherwise the homepage', () => {
  assert.equal(resolvePostLoginTarget({ roles: ['CUSTOMER'] }, '/hotels/mumbai/sea-view'), '/hotels/mumbai/sea-view');
  assert.equal(resolvePostLoginTarget({ roles: ['CUSTOMER'] }, undefined), '/');
});
