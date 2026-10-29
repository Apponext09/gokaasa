import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTime12Hour } from '../../src/features/hotels/hotelTime.js';

test('hotel times display with AM and PM', () => {
  assert.equal(formatTime12Hour('00:00:00'), '12:00 AM');
  assert.equal(formatTime12Hour('11:30'), '11:30 AM');
  assert.equal(formatTime12Hour('13:00:00'), '1:00 PM');
  assert.equal(formatTime12Hour('23:45'), '11:45 PM');
});

test('hotel time formatter safely handles missing or unexpected values', () => {
  assert.equal(formatTime12Hour(null), '—');
  assert.equal(formatTime12Hour('not-set'), 'not-set');
});
