import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isApprovedStaff, homePathFor, resolvePostLoginTarget } from '../../src/features/auth/routing.js';

test('isApprovedStaff: ADMIN and HOTEL_MANAGER are always approved staff, regardless of partnerStatus', () => {
  assert.equal(isApprovedStaff({ roles: ['ADMIN'] }), true);
  assert.equal(isApprovedStaff({ roles: ['HOTEL_MANAGER'] }), true);
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
  assert.equal(homePathFor({ roles: ['HOTEL_MANAGER'] }), '/admin/dashboard');
  assert.equal(homePathFor({ roles: ['HOTEL_OWNER'], partnerStatus: 'APPROVED' }), '/admin/dashboard');
  assert.equal(homePathFor({ roles: ['HOTEL_OWNER'], partnerStatus: 'PENDING_REVIEW' }), '/partner/status');
  assert.equal(homePathFor({ roles: ['CUSTOMER'] }), '/');
});

// Regression coverage for the intermittent-admin-redirect bug: LoginPage used to prefer
// location.state.from over the canonical destination for every role, so an admin whose session
// expired on some other page (or even a customer-only page) would log back in and land there
// instead of the dashboard, instead of always reaching /admin/dashboard.
test('resolvePostLoginTarget: staff and partner roles always go to their canonical page, never a stale "from"', () => {
  assert.equal(resolvePostLoginTarget({ roles: ['ADMIN'] }, '/admin/bookings/42'), '/admin/dashboard');
  assert.equal(resolvePostLoginTarget({ roles: ['ADMIN'] }, '/profile'), '/admin/dashboard');
  assert.equal(resolvePostLoginTarget({ roles: ['ADMIN'] }, undefined), '/admin/dashboard');
  assert.equal(resolvePostLoginTarget({ roles: ['HOTEL_MANAGER'] }, '/my-trips'), '/admin/dashboard');
  assert.equal(
    resolvePostLoginTarget({ roles: ['HOTEL_OWNER'], partnerStatus: 'PENDING_REVIEW' }, '/admin/hotels'),
    '/partner/status',
  );
});

test('resolvePostLoginTarget: a plain customer resumes a specific page when one is given, otherwise the homepage', () => {
  assert.equal(resolvePostLoginTarget({ roles: ['CUSTOMER'] }, '/hotels/mumbai/sea-view'), '/hotels/mumbai/sea-view');
  assert.equal(resolvePostLoginTarget({ roles: ['CUSTOMER'] }, undefined), '/');
});
