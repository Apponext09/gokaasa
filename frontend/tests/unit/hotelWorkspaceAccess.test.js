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

test('archived or explicitly inaccessible hotels stay read-only for admins', () => {
  assert.equal(hotelWorkspaceAccess({ status: 'ARCHIVED', canEdit: true, isAdmin: true, isReviewExecutive: false }).readOnly, true);
  assert.equal(hotelWorkspaceAccess({ status: 'DRAFT', canEdit: false, isAdmin: true, isReviewExecutive: false }).readOnly, true);
});
