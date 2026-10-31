import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAccessAdminPath, isApprovedStaff, homePathFor, resolvePostLoginTarget } from '../../src/features/auth/routing.js';

test('isApprovedStaff: ADMIN is always approved; HOTEL_OWNER requires approved partner status', () => {
  assert.equal(isApprovedStaff({ roles: ['ADMIN'] }), true);
  assert.equal(isApprovedStaff({ roles: ['HOTEL_OWNER'], partnerStatus: 'APPROVED' }), true);
  assert.equal(isApprovedStaff({ roles: ['ADMIN'], partnerStatus: null }), true);
});

test('isApprovedStaff: a HOTEL_OWNER is staff only once approved', () => {
  assert.equal(isApprovedStaff({ roles: ['HOTEL_OWNER'], partnerStatus: 'APPROVED' }), true);
  assert.equal(isApprovedStaff({ roles: ['HOTEL_OWNER'], partnerStatus: 'PENDING_REVIEW' }), false);
  assert.equal(isApprovedStaff({ roles: ['HOTEL_OWNER'], partnerStatus: 'REJECTED' }), false);
  assert.equal(isApprovedStaff({ roles: ['HOTEL_OWNER'], partnerStatus: null }), false);
});

test('isApprovedStaff: a plain CUSTOMER, or no user at all, is never staff', () => {
  assert.equal(isApprovedStaff({ roles: ['CUSTOMER'] }), false);
  assert.equal(isApprovedStaff(null), false);
  assert.equal(isApprovedStaff(undefined), false);
});

test('homePathFor: canonical destination per role', () => {
  assert.equal(homePathFor({ roles: ['ADMIN'] }), '/admin/dashboard');
  assert.equal(homePathFor({ roles: ['HOTEL_OWNER'], partnerStatus: 'APPROVED' }), '/admin/dashboard');
  assert.equal(homePathFor({ roles: ['HOTEL_OWNER'], partnerStatus: 'PENDING_REVIEW' }), '/partner/status');
  assert.equal(homePathFor({ roles: ['CUSTOMER'] }), '/');
  assert.equal(homePathFor({ roles: ['SALES_EXECUTIVE'] }), '/admin/bookings');
  assert.equal(homePathFor({ roles: ['HOTEL_ONBOARDING_EXECUTIVE'] }), '/admin/hotels');
  assert.equal(homePathFor({ roles: ['HOTEL_REVIEW_EXECUTIVE'] }), '/admin/hotel-reviews');
});

test('specialized staff can open only their assigned console areas', () => {
  const sales = { roles: ['SALES_EXECUTIVE'] };
  assert.equal(canAccessAdminPath(sales, '/admin/bookings/42'), true);
  assert.equal(canAccessAdminPath(sales, '/admin/offers/new'), true);
  assert.equal(canAccessAdminPath(sales, '/admin/hotels'), false);
  assert.equal(canAccessAdminPath(sales, '/admin/users'), false);

  const onboarding = { roles: ['HOTEL_ONBOARDING_EXECUTIVE'] };
  assert.equal(canAccessAdminPath(onboarding, '/admin/hotels/onboarding/7/review'), true);
  assert.equal(canAccessAdminPath(onboarding, '/admin/hotels/35'), true);
  assert.equal(canAccessAdminPath(onboarding, '/admin/hotels/35/rooms'), true);
  assert.equal(canAccessAdminPath(onboarding, '/admin/hotels/35/rooms/new'), true);
  assert.equal(canAccessAdminPath(onboarding, '/admin/hotels/35/rooms/8'), true);
  assert.equal(canAccessAdminPath(onboarding, '/admin/bookings'), false);
  assert.equal(canAccessAdminPath(onboarding, '/admin/settings'), false);

  const reviewer = { roles: ['HOTEL_REVIEW_EXECUTIVE'] };
  assert.equal(canAccessAdminPath(reviewer, '/admin/hotel-reviews'), true);
  assert.equal(canAccessAdminPath(reviewer, '/admin/hotels/35'), true);
  assert.equal(canAccessAdminPath(reviewer, '/admin/hotels'), false);
  assert.equal(canAccessAdminPath(reviewer, '/admin/bookings'), false);
});

test('an approved hotel owner sees only its property operations, not internal administration', () => {
  const owner = { roles: ['HOTEL_OWNER'], partnerStatus: 'APPROVED' };

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
  const pendingOwner = { roles: ['HOTEL_OWNER'], partnerStatus: 'PENDING_REVIEW' };
  assert.equal(canAccessAdminPath(pendingOwner, '/admin/dashboard'), false);
  assert.equal(canAccessAdminPath(pendingOwner, '/admin/hotels'), false);
});

// Regression coverage for the intermittent-admin-redirect bug: LoginPage used to prefer
// location.state.from over the canonical destination for every role, so an admin whose session
// expired on some other page (or even a customer-only page) would log back in and land there
// instead of the dashboard, instead of always reaching /admin/dashboard.
test('resolvePostLoginTarget: staff and partner roles always go to their canonical page, never a stale "from"', () => {
  assert.equal(resolvePostLoginTarget({ roles: ['ADMIN'] }, '/admin/bookings/42'), '/admin/dashboard');
  assert.equal(resolvePostLoginTarget({ roles: ['ADMIN'] }, '/profile'), '/admin/dashboard');
  assert.equal(resolvePostLoginTarget({ roles: ['ADMIN'] }, undefined), '/admin/dashboard');
  assert.equal(resolvePostLoginTarget({ roles: ['HOTEL_OWNER'], partnerStatus: 'APPROVED' }, '/my-trips'), '/admin/dashboard');
  assert.equal(
    resolvePostLoginTarget({ roles: ['HOTEL_OWNER'], partnerStatus: 'PENDING_REVIEW' }, '/admin/hotels'),
    '/partner/status',
  );
});

test('resolvePostLoginTarget: a plain customer resumes a specific page when one is given, otherwise the homepage', () => {
  assert.equal(resolvePostLoginTarget({ roles: ['CUSTOMER'] }, '/hotels/mumbai/sea-view'), '/hotels/mumbai/sea-view');
  assert.equal(resolvePostLoginTarget({ roles: ['CUSTOMER'] }, undefined), '/');
});
