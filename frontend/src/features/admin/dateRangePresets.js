/**
 * Shared by EmployeePerformancePage.jsx and EmployeePerformanceDetailPage.jsx so "the same range" means
 * the same `{ from, to }` boundaries on both -- this one place is what keeps a date-filtered row on the
 * listing page and that same employee's detail page in agreement (see onboardingAnalytics backend fix).
 */
export const RANGES = [
  { key: 'all', label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'Last 30 Days' },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'custom', label: 'Custom Range' },
];

export function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** Resolves a preset key (+ custom `{from, to}` when key is 'custom') into the `{from, to}` sent to the API, or `{}` for 'all'. */
export function resolveRange(key, custom) {
  const now = new Date();
  if (key === 'today') return { from: isoDate(now), to: isoDate(now) };
  if (key === '7d') { const d = new Date(now); d.setUTCDate(d.getUTCDate() - 6); return { from: isoDate(d), to: isoDate(now) }; }
  if (key === '30d') { const d = new Date(now); d.setUTCDate(d.getUTCDate() - 29); return { from: isoDate(d), to: isoDate(now) }; }
  if (key === 'thisMonth') return { from: isoDate(startOfMonth(now)), to: isoDate(now) };
  if (key === 'lastMonth') {
    const lastMonthEnd = new Date(startOfMonth(now));
    lastMonthEnd.setUTCDate(lastMonthEnd.getUTCDate() - 1);
    return { from: isoDate(startOfMonth(lastMonthEnd)), to: isoDate(lastMonthEnd) };
  }
  if (key === 'custom') return custom?.from && custom?.to ? custom : {};
  return {};
}
