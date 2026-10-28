import test from 'node:test';
import assert from 'node:assert/strict';
import { restrictSpecializedStaff } from '../../src/middleware/adminConsoleAccess.js';

function decision(role, method, path) {
  let outcome = 'allowed';
  restrictSpecializedStaff({ user: { roles: [role] }, method, path }, {}, (error) => {
    if (error) outcome = error.status;
  });
  return outcome;
}

test('sales API allow-list permits operations but not financial writes or unrelated modules', () => {
  assert.equal(decision('SALES_EXECUTIVE', 'GET', '/bookings/12'), 'allowed');
  assert.equal(decision('SALES_EXECUTIVE', 'GET', '/bookings/12/invoice'), 'allowed');
  assert.equal(decision('SALES_EXECUTIVE', 'PATCH', '/coupons/3/status'), 'allowed');
  assert.equal(decision('SALES_EXECUTIVE', 'POST', '/bookings/12/cancel'), 403);
  assert.equal(decision('SALES_EXECUTIVE', 'DELETE', '/coupons/3'), 403);
  assert.equal(decision('SALES_EXECUTIVE', 'GET', '/users'), 403);
});

test('onboarding API allow-list permits hotel preparation but not inventory or operations', () => {
  assert.equal(decision('HOTEL_ONBOARDING_EXECUTIVE', 'POST', '/hotels'), 'allowed');
  assert.equal(decision('HOTEL_ONBOARDING_EXECUTIVE', 'PATCH', '/hotels/35'), 'allowed');
  assert.equal(decision('HOTEL_ONBOARDING_EXECUTIVE', 'POST', '/hotel-import/search'), 'allowed');
  assert.equal(decision('HOTEL_ONBOARDING_EXECUTIVE', 'GET', '/hotels/35/room-types'), 'allowed');
  assert.equal(decision('HOTEL_ONBOARDING_EXECUTIVE', 'POST', '/hotels/35/cancellation-policies'), 'allowed');
  assert.equal(decision('HOTEL_ONBOARDING_EXECUTIVE', 'PATCH', '/rate-plans/8'), 'allowed');
  assert.equal(decision('HOTEL_ONBOARDING_EXECUTIVE', 'POST', '/room-types/8/calendar/bulk'), 403);
  assert.equal(decision('HOTEL_ONBOARDING_EXECUTIVE', 'GET', '/bookings'), 403);
});

test('legacy staff roles continue through to existing route-level authorization', () => {
  assert.equal(decision('ADMIN', 'GET', '/users'), 'allowed');
  assert.equal(decision('HOTEL_MANAGER', 'GET', '/settings'), 'allowed');
  assert.equal(decision('HOTEL_OWNER', 'GET', '/dashboard/summary'), 'allowed');
});
