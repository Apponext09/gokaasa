import test from 'node:test';
import assert from 'node:assert/strict';
import { hotelWorkspaceAccess } from '../../src/features/hotels/hotelWorkspaceAccess.js';

test('an admin can edit a hotel while performing its pending review', () => {
  assert.deepEqual(
    hotelWorkspaceAccess({ status: 'PENDING_REVIEW', canEdit: true, isAdmin: true, isReviewExecutive: false }),
    { readOnly: false, reviewOnly: false, waitingForReviewer: false },
  );
});

test('admin access takes precedence when an account also carries the reviewer role', () => {
  assert.equal(hotelWorkspaceAccess({ status: 'PENDING_REVIEW', canEdit: true, isAdmin: true, isReviewExecutive: true }).readOnly, false);
});

test('review executives and onboarding staff cannot edit while review is pending', () => {
  assert.equal(hotelWorkspaceAccess({ status: 'PENDING_REVIEW', canEdit: true, isAdmin: false, isReviewExecutive: true }).readOnly, true);
  assert.equal(hotelWorkspaceAccess({ status: 'PENDING_REVIEW', canEdit: true, isAdmin: false, isReviewExecutive: false }).readOnly, true);
});

test('an onboarding executive individually granted review access can still edit the hotels they onboard', () => {
  // hotel_review_access grants console.review on top of console.onboarding, so this account carries
  // both isReviewExecutive and isOnboardingExecutive -- it must not be treated as review-only.
  assert.deepEqual(
    hotelWorkspaceAccess({ status: 'DRAFT', canEdit: true, isAdmin: false, isReviewExecutive: true, isOnboardingExecutive: true }),
    { readOnly: false, reviewOnly: false, waitingForReviewer: false },
  );
});

test('a pure review executive without onboarding access remains review-only', () => {
  assert.equal(
    hotelWorkspaceAccess({ status: 'DRAFT', canEdit: true, isAdmin: false, isReviewExecutive: true, isOnboardingExecutive: false }).reviewOnly,
    true,
  );
});

test('archived or explicitly inaccessible hotels stay read-only for admins', () => {
  assert.equal(hotelWorkspaceAccess({ status: 'ARCHIVED', canEdit: true, isAdmin: true, isReviewExecutive: false }).readOnly, true);
  assert.equal(hotelWorkspaceAccess({ status: 'DRAFT', canEdit: false, isAdmin: true, isReviewExecutive: false }).readOnly, true);
});
