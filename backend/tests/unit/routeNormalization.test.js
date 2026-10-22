import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRoute, UNKNOWN_ROUTE } from '../../src/domain/routeNormalization.js';

test('a known static route maps to its friendly label unchanged', () => {
  assert.deepEqual(normalizeRoute('/'), { route: '/', label: 'Home' });
  assert.deepEqual(normalizeRoute('/my-trips'), { route: '/my-trips', label: 'My Trips' });
  assert.deepEqual(normalizeRoute('/wishlist'), { route: '/wishlist', label: 'Wishlist' });
});

test('a hotel detail path is normalized to its template, never leaking the real slug as the "route"', () => {
  const result = normalizeRoute('/hotels/mumbai/taj-palace-colaba');
  assert.equal(result.route, '/hotels/:citySlug/:hotelSlug');
  assert.equal(result.label, 'Hotel Details');
});

test('a hotel search destination path is normalized to its template', () => {
  assert.deepEqual(normalizeRoute('/hotels/goa'), { route: '/hotels/:destination', label: 'Hotel Search' });
});

test('a booking confirmation id is stripped out of the stored route', () => {
  const result = normalizeRoute('/booking/confirmation/48213');
  assert.equal(result.route, '/booking/confirmation/:bookingId');
  assert.doesNotMatch(result.route, /48213/);
});

test('admin sub-pages get a scoped, friendly label', () => {
  assert.deepEqual(normalizeRoute('/admin/customers'), { route: '/admin/customers', label: 'Admin · Customers' });
  assert.deepEqual(normalizeRoute('/admin/dashboard'), { route: '/admin/dashboard', label: 'Admin · Dashboard' });
});

test('an unrecognized path collapses to the generic "other" template rather than echoing raw input', () => {
  const result = normalizeRoute('/something/weird/with-an-id-42');
  assert.equal(result.route, 'other');
  assert.doesNotMatch(result.route, /weird|42/);
});

test('a query string or fragment is stripped before matching, never stored', () => {
  const result = normalizeRoute('/wishlist?token=secret123#section');
  assert.equal(result.route, '/wishlist');
  assert.doesNotMatch(JSON.stringify(result), /secret123/);
});

test('empty or non-string input never throws and resolves to "not available"', () => {
  assert.deepEqual(normalizeRoute(''), UNKNOWN_ROUTE);
  assert.deepEqual(normalizeRoute(undefined), UNKNOWN_ROUTE);
  assert.deepEqual(normalizeRoute(null), UNKNOWN_ROUTE);
});

test('an oversized path is truncated rather than stored in full', () => {
  const huge = `/${'a'.repeat(5000)}`;
  const result = normalizeRoute(huge);
  assert.equal(result.route, 'other');
});
