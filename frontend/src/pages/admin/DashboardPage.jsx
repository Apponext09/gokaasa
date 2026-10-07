import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Building2, CalendarCheck, IndianRupee, Timer, Users, BedDouble, Search, ClipboardCheck, CircleAlert, Rocket, TrendingUp } from 'lucide-react';
import { Alert, Badge, Card, CardContent, Skeleton } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { PageHeader, formatMoney } from '@/components/shared/index.jsx';
import { BOOKING_STATUS_LABEL } from '@/features/booking/bookingFormat.js';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

function StatCard({ icon: Icon, label, value, hint, to }) {
  const body = (
    <CardContent className="flex items-start gap-4 p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-[var(--text-muted)]">{label}</p>
        <p className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</p>}
      </div>
    </CardContent>
  );
  return <Card className={to ? 'transition-shadow hover:shadow-sm' : ''}>{to ? <Link to={to} className="block rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-brand-500">{body}</Link> : body}</Card>;
}

function formatMinutes(value) {
  if (value == null) return 'No imports in the last 30 days';
  if (value < 1) return `${Math.round(value * 60)} sec`;
  return `${value.toFixed(1)} min`;
}

const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const RANGES = [
  { key: 'today', label: 'Today', days: 0 },
  { key: '7d', label: '7 Days', days: 6 },
  { key: '30d', label: '30 Days', days: 29 },
  { key: '90d', label: '90 Days', days: 89 },
];

function isoDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

/** One metric, one line. Two separate charts rather than one dual-axis chart. */
function TrendChart({ data, dataKey, color, valueFormatter, label }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-[var(--text-strong)]">{label}</p>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`fill-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
          <YAxis width={36} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            formatter={(value) => [valueFormatter ? valueFormatter(value) : value, label]}
            labelFormatter={shortDate}
            contentStyle={{ borderRadius: 10, border: '1px solid var(--border-subtle)', fontSize: 12 }}
          />
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#fill-${dataKey})`} dot={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [rangeKey, setRangeKey] = useState('30d');
  const [trends, setTrends] = useState(null);
  const [trendsError, setTrendsError] = useState(null);

  useEffect(() => {
    adminApi.dashboard().then(setData).catch((err) => setError(normalizeError(err).message));
  }, []);

  const range = useMemo(() => {
    const preset = RANGES.find((r) => r.key === rangeKey) ?? RANGES[2];
    return { from: isoDaysAgo(preset.days), to: isoToday() };
  }, [rangeKey]);

  useEffect(() => {
    let cancelled = false;
    setTrendsError(null);
    adminApi
      .dashboardTrends(range)
      .then((result) => !cancelled && setTrends(result))
      .catch((err) => !cancelled && setTrendsError(normalizeError(err).message));
    return () => {
      cancelled = true;
    };
  }, [range]);

  if (error) return <Alert tone="error" title="Dashboard unavailable">{error}</Alert>;

  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-28" />)}
        </div>
      </div>
    );
  }

  const { hotels, rooms, customers, bookings, onboarding } = data;
  const revenueData = trends?.revenueSeries.map((row) => ({ date: row.date, amount: row.collectedMinor / 100 })) ?? [];
  const bookingData = trends?.bookingSeries ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Live figures from the Gokaasa database. Nothing on this page is estimated."
        actions={
          <Link to="/admin/hotels/onboarding">
            <Button size="md">
              <Search className="h-4 w-4" aria-hidden="true" /> Import a hotel
            </Button>
          </Link>
        }
      />

      <section aria-labelledby="trends-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="trends-heading" className="flex items-center gap-2 text-base font-semibold text-[var(--text-strong)]">
            <TrendingUp className="h-4 w-4 text-brand-700" aria-hidden="true" /> Trends
          </h2>
          <div className="flex gap-1 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRangeKey(r.key)}
                className={`rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-xs font-medium transition-colors ${rangeKey === r.key ? 'bg-brand-600 text-white' : 'text-[var(--text-body)] hover:bg-[var(--surface-muted)]'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {trendsError && <Alert tone="error">{trendsError}</Alert>}

        {!trends && !trendsError ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        ) : trends && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="p-5">
                <TrendChart data={bookingData} dataKey="count" color="#1e3a5f" label="Bookings over time" />
              </Card>
              <Card className="p-5">
                <TrendChart data={revenueData} dataKey="amount" color="#cc8a2a" label="Revenue over time" valueFormatter={(v) => formatMoney(v * 100)} />
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
              <Card className="p-5">
                <p className="mb-3 text-sm font-medium text-[var(--text-strong)]">Revenue</p>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div><dt className="text-[var(--text-muted)]">Gross booking value</dt><dd className="text-lg font-semibold text-[var(--text-strong)]">{formatMoney(trends.revenue.grossMinor)}</dd></div>
                  <div><dt className="text-[var(--text-muted)]">Collected</dt><dd className="text-lg font-semibold text-[var(--text-strong)]">{formatMoney(trends.revenue.collectedMinor)}</dd></div>
                  <div><dt className="text-[var(--text-muted)]">Refunded</dt><dd className="text-lg font-semibold text-danger-600">{formatMoney(trends.revenue.refundedMinor)}</dd></div>
                  <div><dt className="text-[var(--text-muted)]">Net</dt><dd className="text-lg font-semibold text-success-600">{formatMoney(trends.revenue.netMinor)}</dd></div>
                </dl>
              </Card>

              <Card className="p-5">
                <p className="mb-3 text-sm font-medium text-[var(--text-strong)]">Booking status</p>
                <div className="flex flex-col gap-2">
                  {Object.entries(trends.statusBreakdown).length === 0 && <p className="text-sm text-[var(--text-muted)]">No bookings in this range.</p>}
                  {Object.entries(trends.statusBreakdown).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between text-sm">
                      <Badge tone={BOOKING_STATUS_LABEL[status]?.tone ?? 'neutral'}>{BOOKING_STATUS_LABEL[status]?.label ?? status}</Badge>
                      <span className="font-medium text-[var(--text-strong)]">{count}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5">
                <p className="mb-3 text-sm font-medium text-[var(--text-strong)]">Top hotels</p>
                <div className="flex flex-col gap-2">
                  {trends.topHotels.length === 0 && <p className="text-sm text-[var(--text-muted)]">No bookings in this range.</p>}
                  {trends.topHotels.map((hotel) => (
                    <Link key={hotel.id} to={`/admin/hotels/${hotel.id}`} className="flex items-center justify-between text-sm hover:text-brand-700">
                      <span className="truncate text-[var(--text-body)]">{hotel.name}</span>
                      <span className="shrink-0 font-medium text-[var(--text-strong)]">{formatMoney(hotel.revenueMinor)}</span>
                    </Link>
                  ))}
                </div>
              </Card>
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="onboarding-heading" className="space-y-4">
        <h2 id="onboarding-heading" className="text-base font-semibold text-[var(--text-strong)]">
          Hotel onboarding
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Rocket} label="Imported today" value={onboarding.importedToday} />
          <StatCard icon={ClipboardCheck} label="Pending verification" value={onboarding.pendingVerification} hint="Imported drafts not yet published" to="/admin/hotels?status=DRAFT" />
          <StatCard icon={Building2} label="Published" value={onboarding.published} to="/admin/hotels?status=PUBLISHED" />
          <StatCard icon={CircleAlert} label="Failed imports (30 days)" value={onboarding.failedImports30d} to="/admin/hotels/onboarding" />
        </div>
        <Card>
          <CardContent className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Timer className="h-5 w-5 text-brand-700" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-[var(--text-strong)]">Average time to a verified draft</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Measured from import request to draft creation, across {onboarding.completedImports30d} import(s) in the last 30 days. Admin review time is not included.
                </p>
              </div>
            </div>
            <p className="text-xl font-semibold text-[var(--text-strong)]">{formatMinutes(onboarding.averageImportMinutes30d)}</p>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="inventory-heading" className="space-y-4">
        <h2 id="inventory-heading" className="text-base font-semibold text-[var(--text-strong)]">
          Inventory and demand
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Building2} label="Total hotels" value={hotels.total} hint={`${hotels.drafts} draft · ${hotels.pendingReview} in review`} to="/admin/hotels" />
          <StatCard icon={BedDouble} label="Total rooms" value={rooms.total} />
          <StatCard icon={Users} label="Customers" value={customers.total} to="/admin/customers" />
          <StatCard icon={CalendarCheck} label="Bookings" value={bookings.total} hint={`${bookings.today} created today`} to="/admin/bookings" />
        </div>
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <IndianRupee className="h-5 w-5 text-brand-700" aria-hidden="true" />
            <div>
              <p className="text-sm text-[var(--text-muted)]">Confirmed revenue</p>
              <p className="text-xl font-semibold text-[var(--text-strong)]">{formatMoney(bookings.revenueMinor, bookings.currency)}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      {hotels.total === 0 && (
        <Card className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-[var(--text-strong)]">No hotels yet</p>
            <p className="text-sm text-[var(--text-muted)]">Search for a hotel by name and city to create your first draft in a few minutes.</p>
          </div>
          <Link to="/admin/hotels/onboarding" className="text-sm font-medium text-brand-600 hover:underline">
            Start onboarding
          </Link>
        </Card>
      )}
    </div>
  );
}
