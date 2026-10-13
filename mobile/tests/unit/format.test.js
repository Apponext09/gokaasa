import {
  formatStayDate,
  formatMoneyMinor,
  formatCountdown,
  occupancyLabel,
  formatOccupancy,
  occupancyFromGuests,
  nightsBetween,
  addDaysIso,
} from '../../src/utils/format.js';

describe('formatMoneyMinor', () => {
  test('converts integer minor units (paise) to a real rupee display, never a float typo', () => {
    expect(formatMoneyMinor(313600)).toBe('₹3,136');
  });

  test('returns an empty string rather than "₹NaN" when the amount is missing', () => {
    expect(formatMoneyMinor(null)).toBe('');
    expect(formatMoneyMinor(undefined)).toBe('');
  });
});

describe('formatStayDate', () => {
  test('formats an ISO date using UTC, never shifting a calendar day across a timezone boundary', () => {
    // A naive new Date('2026-11-12') interpreted in a negative-UTC-offset timezone could render as
    // Nov 11 -- this must always read as the calendar date actually stored, exactly like the website.
    expect(formatStayDate('2026-11-12', { day: 'numeric', month: 'short', year: 'numeric' })).toBe('12 Nov 2026');
  });

  test('returns an empty string for a missing date rather than "Invalid Date"', () => {
    expect(formatStayDate(null)).toBe('');
    expect(formatStayDate(undefined)).toBe('');
  });
});

describe('formatCountdown', () => {
  test('formats seconds as mm:ss, zero-padded', () => {
    expect(formatCountdown(65)).toBe('01:05');
    expect(formatCountdown(5)).toBe('00:05');
    expect(formatCountdown(600)).toBe('10:00');
  });

  test('never goes negative when the hold has already expired', () => {
    expect(formatCountdown(-30)).toBe('00:00');
  });
});

describe('occupancyLabel', () => {
  test('summarizes rooms/adults/children exactly like the website\'s bookingFormat.js', () => {
    expect(occupancyLabel([{ adults: 2, childAges: [] }])).toBe('1 room · 2 adults');
    expect(occupancyLabel([{ adults: 2, childAges: [7] }, { adults: 1, childAges: [] }])).toBe('2 rooms · 3 adults · 1 child');
  });
});

describe('formatOccupancy (the exact URL-shareable shape backend/src/domain/occupancy.js parses)', () => {
  test('encodes a single adult-only room', () => {
    expect(formatOccupancy([{ adults: 2, childAges: [] }])).toBe('2');
  });

  test('encodes multiple rooms with child ages, matching the backend\'s "adults-age.age|adults" grammar', () => {
    expect(formatOccupancy([{ adults: 2, childAges: [7, 12] }, { adults: 1, childAges: [] }])).toBe('2-7.12|1');
  });
});

describe('occupancyFromGuests', () => {
  test('reconstructs each room\'s occupancy from a booking\'s flat guest list, counting age < 18 as a child', () => {
    const guests = [
      { roomIndex: 0, age: 30 },
      { roomIndex: 0, age: 8 },
      { roomIndex: 1, age: 45 },
    ];
    expect(occupancyFromGuests(guests)).toEqual([
      { adults: 1, childAges: [8] },
      { adults: 1, childAges: [] },
    ]);
  });

  test('is empty for a missing/empty guest list, never throws', () => {
    expect(occupancyFromGuests([])).toEqual([]);
    expect(occupancyFromGuests(undefined)).toEqual([]);
  });

  test('orders rooms by roomIndex even when guests arrive out of order', () => {
    const guests = [
      { roomIndex: 1, age: 40 },
      { roomIndex: 0, age: 35 },
    ];
    expect(occupancyFromGuests(guests).length).toBe(2);
    expect(occupancyFromGuests(guests)[0]).toEqual({ adults: 1, childAges: [] });
  });
});

describe('nightsBetween / addDaysIso', () => {
  test('counts whole nights between two ISO dates', () => {
    expect(nightsBetween('2026-11-12', '2026-11-14')).toBe(2);
  });

  test('is zero, not NaN, when either date is missing', () => {
    expect(nightsBetween(null, '2026-11-14')).toBe(0);
    expect(nightsBetween('2026-11-12', null)).toBe(0);
  });

  test('adds whole days on an ISO date string', () => {
    expect(addDaysIso('2026-11-12', 1)).toBe('2026-11-13');
    expect(addDaysIso('2026-11-30', 1)).toBe('2026-12-01');
  });
});
