import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, CalendarDays, CalendarRange, UserCog, PencilLine, Clock3, CheckCircle2, AlertTriangle, ChevronDown,
} from 'lucide-react';
import { Card, Skeleton, Alert, Badge } from '@/components/ui/surfaces.jsx';
import { PageHeader, EmptyState, formatDateTime } from '@/components/shared/index.jsx';
import { StatCard, TrendChart, BarComparisonChart, DonutPanel } from '@/components/admin/analyticsCharts.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

function monthLabel(month) {
  if (!month) return '';
  const [year, m] = month.split('-');
  return new Date(Date.UTC(Number(year), Number(m) - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

function ActivityRow({ item }) {
  const [open, setOpen] = useState(false);
  const label = item.action.replaceAll(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  const hasDetails = item.oldValue || item.newValue;
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-[var(--text-strong)]">
            <span className="font-medium">{item.actor ? item.actor.name : 'System'}</span>{' '}
            {label.toLowerCase()}
            {item.hotelName && (
              <>
                {' '}
                <Link to={`/admin/hotels/${item.hotelId}`} className="font-medium text-brand-700 hover:underline">{item.hotelName}</Link>
              </>
            )}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{formatDateTime(item.createdAt)}</p>
        </div>
        {hasDetails && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex shrink-0 items-center gap-1 text-xs text-brand-700 hover:underline">
            <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" /> Details
          </button>
        )}
      </div>
      {open && hasDetails && (
        <pre className="mt-2 max-h-40 overflow-auto rounded-[var(--radius-control)] bg-[var(--surface-muted)] p-2 text-[11px] text-[var(--text-body)]">
          {JSON.stringify({ old: item.oldValue ?? null, new: item.newValue ?? null }, null, 2)}
        </pre>
      )}
    </li>
  );
}

export function OnboardingAnalyticsOverviewPage() {
  const [data, setData] = useState(null);
  const [trends, setTrends] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    adminApi.onboardingAnalyticsOverview().then((result) => !cancelled && setData(result)).catch((err) => !cancelled && setError(normalizeError(err).message));
    adminApi.onboardingAnalyticsMonthlyTrends({ months: 12 }).then((result) => !cancelled && setTrends(result)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const o = data?.overview;

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto">
      <PageHeader title="Onboarding & Performance Analytics" description="Who onboarded and edited each hotel, and how each employee is performing." />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {o ? (
          <>
            <StatCard icon={Building2} tone="navy" label="Total Hotels Onboarded" value={o.totalHotelsOnboarded} />
            <StatCard icon={CalendarDays} tone="blue" label="Onboarded This Month" value={o.onboardedThisMonth} />
            <StatCard icon={CalendarRange} tone="blue" label="Onboarded This Week" value={o.onboardedThisWeek} />
            <StatCard icon={UserCog} tone="purple" label="Active Onboarding Executives" value={o.activeOnboardingExecutives} />
            <StatCard icon={PencilLine} tone="gold" label="Total Hotels Edited" value={o.totalHotelsEdited} />
            <StatCard icon={Clock3} tone="gold" label="Pending Hotel Reviews" value={o.pendingReview} />
            <StatCard icon={CheckCircle2} tone="green" label="Approved Hotels" value={o.approved} />
            <StatCard icon={AlertTriangle} tone="red" label="Changes Requested" value={o.changesRequested} />
          </>
        ) : (
          Array.from({ length: 8 }, (_, i) => <Card key={i} className="p-5"><Skeleton className="h-20 w-full" /></Card>)
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          {trends ? (
            <TrendChart
              data={trends}
              dataKey="count"
              xKey="month"
              label="Monthly Onboarding Trends"
              gradientId="onboarding-monthly-trend"
              labelFormatter={monthLabel}
              valueFormatter={(v) => `${v} hotel${v === 1 ? '' : 's'}`}
              emptyLabel="No hotels were onboarded in this period."
            />
          ) : <Skeleton className="h-64 w-full" />}
        </Card>
        {o ? (
          <DonutPanel
            title="Onboarding Status Distribution"
            description="Current review status of every hotel"
            icon={Clock3}
            iconTone="gold"
            totalLabel="Hotels in the pipeline"
            data={[
              { key: 'pending', name: 'Pending Review', count: o.pendingReview },
              { key: 'changes', name: 'Changes Requested', count: o.changesRequested },
              { key: 'approved', name: 'Approved', count: o.approved },
            ]}
          />
        ) : <Card className="p-5 sm:p-6"><Skeleton className="h-64 w-full" /></Card>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold text-[var(--text-strong)]">Employee-wise Hotel Onboarding</h3>
          {data ? (
            <BarComparisonChart
              data={data.employeeWiseOnboarding}
              categoryKey="name"
              emptyLabel="No hotels have been onboarded yet."
              series={[
                { key: 'approved', label: 'Approved' },
                { key: 'pending', label: 'Pending' },
                { key: 'changesRequested', label: 'Changes Requested' },
              ]}
            />
          ) : <Skeleton className="h-64 w-full" />}
        </Card>
        <Card className="p-5 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold text-[var(--text-strong)]">Employee-wise Editing Activity</h3>
          {data ? (
            <BarComparisonChart
              data={data.employeeWiseEditing}
              categoryKey="name"
              emptyLabel="No hotels have been edited yet."
              series={[
                { key: 'uniqueHotelsEdited', label: 'Unique Hotels Edited' },
                { key: 'totalModifications', label: 'Total Modification Activities' },
              ]}
            />
          ) : <Skeleton className="h-64 w-full" />}
        </Card>
      </div>

      <Card className="p-5 sm:p-6">
        <h3 className="mb-1 text-sm font-semibold text-[var(--text-strong)]">Recent Activities</h3>
        <p className="mb-2 text-xs text-[var(--text-muted)]">Latest hotel onboarding and editing activity across the platform</p>
        {!data ? (
          <div className="space-y-3 pt-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : data.recentActivities.length === 0 ? (
          <EmptyState title="No activity yet" />
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {data.recentActivities.map((item) => <ActivityRow key={item.id} item={item} />)}
          </ul>
        )}
      </Card>
    </div>
  );
}
