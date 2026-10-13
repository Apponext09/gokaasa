import { validateSearchCriteria } from '../../src/utils/searchValidation.js';

describe('validateSearchCriteria (Phase 2: search validation)', () => {
  test('requires a destination', () => {
    expect(validateSearchCriteria(null, '2026-11-12', '2026-11-14')).toMatch(/destination/i);
  });

  test('requires both dates', () => {
    expect(validateSearchCriteria({ destination: 'mumbai' }, null, '2026-11-14')).toMatch(/date/i);
    expect(validateSearchCriteria({ destination: 'mumbai' }, '2026-11-12', null)).toMatch(/date/i);
  });

  test('rejects a check-out that is not after check-in', () => {
    expect(validateSearchCriteria({ destination: 'mumbai' }, '2026-11-14', '2026-11-14')).toMatch(/check-out/i);
    expect(validateSearchCriteria({ destination: 'mumbai' }, '2026-11-14', '2026-11-12')).toMatch(/check-out/i);
  });

  test('rejects a check-in date in the past', () => {
    expect(validateSearchCriteria({ destination: 'mumbai' }, '2000-01-01', '2000-01-02')).toMatch(/past/i);
  });

  test('passes for a real, valid, forward-looking destination + date range', () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const checkIn = future.toISOString().slice(0, 10);
    future.setDate(future.getDate() + 2);
    const checkOut = future.toISOString().slice(0, 10);
    expect(validateSearchCriteria({ destination: 'mumbai' }, checkIn, checkOut)).toBeNull();
  });
});
