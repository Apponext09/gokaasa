import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOccupancy, formatOccupancy, occupancyTotals, occupancyFromTotals, OccupancyError } from '../../src/domain/occupancy.js';

test('parses rooms, adults and children ages from the URL form', () => {
  assert.deepEqual(parseOccupancy('2-7.12|1'), [
    { adults: 2, childAges: [7, 12] },
    { adults: 1, childAges: [] },
  ]);
});

test('an empty occupancy defaults to one room with two adults', () => {
  assert.deepEqual(parseOccupancy(undefined), [{ adults: 2, childAges: [] }]);
  assert.deepEqual(parseOccupancy(''), [{ adults: 2, childAges: [] }]);
});

test('formatting and parsing round-trip', () => {
  const rooms = parseOccupancy('3|2-0.17');
  assert.equal(formatOccupancy(rooms), '3|2-0.17');
  assert.deepEqual(parseOccupancy(formatOccupancy(rooms)), rooms);
});

test('rejects zero adults, too many adults and too many rooms', () => {
  assert.throws(() => parseOccupancy('0'), OccupancyError);
  assert.throws(() => parseOccupancy('7'), OccupancyError);
  assert.throws(() => parseOccupancy(Array(9).fill('1').join('|')), /at most 8 rooms/);
});

test('rejects children beyond the per-room limit and out-of-range ages', () => {
  assert.throws(() => parseOccupancy('2-1.2.3.4.5'), /at most 4 children/);
  assert.throws(() => parseOccupancy('2-18'), /0 to 17/);
  assert.throws(() => parseOccupancy('2-x'), /whole numbers/);
  assert.throws(() => parseOccupancy('two'), /whole number/);
});

test('totals count rooms, adults and children', () => {
  assert.deepEqual(occupancyTotals(parseOccupancy('2-7.12|1')), { rooms: 2, adults: 3, children: 2 });
});

test('legacy totals split evenly across rooms', () => {
  assert.deepEqual(occupancyFromTotals({ rooms: 2, adults: 4, children: 2 }), [
    { adults: 2, childAges: [0] },
    { adults: 2, childAges: [0] },
  ]);
});
