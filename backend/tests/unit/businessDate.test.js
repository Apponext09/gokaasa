import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { localToday, zonedTimeToInstant, assertTimeZone } from '../../src/domain/businessDate.js';

describe('hotel-local dates', () => {
  it('uses the hotel calendar date, not the UTC date: 20:00 UTC on 9 Oct is already 10 Oct in Mumbai', () => {
    const instant = new Date('2026-10-09T20:00:00Z');
    assert.equal(localToday('Asia/Kolkata', instant), '2026-10-10');
    assert.equal(localToday('UTC', instant), '2026-10-09');
  });

  it('keeps the date stable across the zone boundary for a New York hotel', () => {
    assert.equal(localToday('America/New_York', new Date('2026-10-10T03:00:00Z')), '2026-10-09');
    assert.equal(localToday('America/New_York', new Date('2026-10-10T05:00:00Z')), '2026-10-10');
  });

  it('turns a hotel check-in time into the right UTC instant', () => {
    // 14:00 in Mumbai (UTC+05:30) is 08:30 UTC.
    assert.equal(zonedTimeToInstant('2026-10-10', '14:00', 'Asia/Kolkata').toISOString(), '2026-10-10T08:30:00.000Z');
  });

  it('rejects unknown time zone names', () => {
    assert.throws(() => assertTimeZone('Mars/Olympus'), RangeError);
    assert.equal(assertTimeZone('Asia/Kolkata'), 'Asia/Kolkata');
  });
});
