import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occupancyFromGuests, rebookPath } from '../../src/features/booking/bookingFormat.js';
import { notificationPath } from '../../src/features/notifications/notificationPath.js';

test('occupancyFromGuests groups guests by room and splits adults from children by age', () => {
  const guests = [
    { roomIndex: 0, name: 'A', age: 30 },
    { roomIndex: 0, name: 'B', age: 8 },
    { roomIndex: 1, name: 'C', age: 25 },
  ];
  assert.deepEqual(occupancyFromGuests(guests), [
    { adults: 1, childAges: [8] },
    { adults: 1, childAges: [] },
  ]);
});

test('occupancyFromGuests orders rooms by index even when guests arrive out of order', () => {
  const guests = [
    { roomIndex: 1, name: 'B', age: 40 },
    { roomIndex: 0, name: 'A', age: 35 },
  ];
  const result = occupancyFromGuests(guests);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], { adults: 1, childAges: [] });
});

test('occupancyFromGuests is empty for an empty or missing guest list, never throws', () => {
  assert.deepEqual(occupancyFromGuests([]), []);
  assert.deepEqual(occupancyFromGuests(undefined), []);
});

function booking(overrides = {}) {
  return { hotel: { slug: 'the-grand', city: 'Goa' }, guests: [{ roomIndex: 0, name: 'A', age: 30 }], ...overrides };
}

test('rebookPath points at the hotel\'s own page with the party size carried over, never a date or price', () => {
  const path = rebookPath(booking());
  assert.match(path, /^\/hotels\/goa\/the-grand\?occ=/);
  assert.equal(path.includes('checkIn'), false);
  assert.equal(path.includes('total'), false);
});

test('rebookPath omits the occ param entirely when there is no guest data (e.g. a trip summary)', () => {
  const path = rebookPath(booking({ guests: [] }));
  assert.equal(path, '/hotels/goa/the-grand');
});

test('rebookPath falls back to /destinations when the hotel has no slug (defensive, should not happen)', () => {
  assert.equal(rebookPath({ hotel: { city: 'Goa' }, guests: [] }), '/destinations');
  assert.equal(rebookPath({ hotel: null, guests: [] }), '/destinations');
});

test('notificationPath links a booking notification to its My Trips detail page', () => {
  assert.equal(notificationPath({ entityType: 'booking', entityId: 42 }), '/my-trips/42');
});

test('notificationPath links hotel workflow notices to the internal review tab', () => {
  assert.equal(notificationPath({ entityType: 'hotel', entityId: 1 }), '/admin/hotels/1?tab=review');
});

test('notificationPath links nowhere when an entity has no viewer page', () => {
  assert.equal(notificationPath({ entityType: 'booking', entityId: null }), null);
  assert.equal(notificationPath({ entityType: null, entityId: null }), null);
});
