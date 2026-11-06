import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, CheckCircle2, Clock3, AlertTriangle, PencilLine, ChevronDown } from 'lucide-react';
import { Card, Skeleton, Alert, Badge } from '@/components/ui/surfaces.jsx';
import { Input } from '@/components/ui/form-controls.jsx';
import { EmptyState, PageHeader, Pagination, formatDateTime } from '@/components/shared/index.jsx';
import { StatCard, TrendChart, RangeSelector } from '@/components/admin/analyticsCharts.jsx';
import { RANGES, resolveRange } from '@/features/admin/dateRangePresets.js';
import { roleLabel } from '@/features/auth/roleLabels.js';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

function monthLabel(month) {
  if (!month) return '';
  const [year, m] = month.split('-');
  return new Date(Date.UTC(Number(year), Number(m) - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

function ActivityRow({ entry }) {
  const [open, setOpen] = useState(false);
  const hasDetails = entry.oldValue || entry.newValue;
  return (
    <li className="space-y-2 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-[var(--text-strong)]">{entry.action.replaceAll(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}</p>
            <Badge tone="neutral">{entry.entity}</Badge>
          </div>
          <p className="text-xs text-[var(--text-muted)]">Entity ID {entry.entityId} · {formatDateTime(entry.createdAt)}</p>
        </div>
        {hasDetails && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex shrink-0 items-center gap-1 text-xs text-brand-700 hover:underline">
            <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" /> {open ? 'Hide' : 'View'} changes
          </button>
        )}
      </div>
      {open && hasDetails && (
        <pre className="max-h-48 overflow-auto rounded-[var(--radius-control)] bg-[var(--surface-muted)] p-2 text-[11px] text-[var(--text-body)]">
          {JSON.stringify({ previousValues: entry.oldValue ?? null, updatedValues: entry.newValue ?? null }, null, 2)}
        </pre>
      )}
    </li>
  );
}

export function EmployeePerformanceDetailPage() {
  const { id } = useParams();
  // Seeded from the URL so arriving from a date-filtered Employee Performance listing keeps the exact
  // same range here -- this, plus the backend fix making both endpoints apply identical boundaries for
  // the same { from, to }, is what keeps the two pages' KPI counts in agreement.
  const [params, setParams] = useSearchParams();
  const [rangeKey, setRangeKeyState] = useState(params.get('range') || 'all');
  const [customFrom, setCustomFrom] = useState(params.get('range') === 'custom' ? params.get('from') ?? '' : '');
  const [customTo, setCustomTo] = useState(params.get('range') === 'custom' ? params.get('to') ?? '' : '');
  const [employee, setEmployee] = useState(null);
  const [error, setError] = useState(null);
  const [activities, setActivities] = useState(null);
  const [activitiesPage, setActivitiesPage] = useState(1);

  const range = resolveRange(rangeKey, { from: customFrom, to: customTo });
  const rangeReady = rangeKey !== 'custom' || (customFrom && customTo);

  const setRangeKey = (key) => {
    setRangeKeyState(key);
    const next = new URLSearchParams(params);
    if (key === 'all') { next.delete('range'); next.delete('from'); next.delete('to'); } else { next.set('range', key); }
    if (key !== 'custom') { next.delete('from'); next.delete('to'); }
    setParams(next, { replace: true });
  };
  const setCustom = (from, to) => {
    setCustomFrom(from);
    setCustomTo(to);
    const next = new URLSearchParams(params);
    next.set('range', 'custom');
    if (from) next.set('from', from); else next.delete('from');
    if (to) next.set('to', to); else next.delete('to');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (!rangeReady) return undefined;
    let cancelled = false;
    setError(null);
    adminApi.getEmployeePerformance(id, range).then((result) => !cancelled && setEmployee(result)).catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, rangeKey, customFrom, customTo]);

  useEffect(() => {
    if (!rangeReady) return undefined;
    let cancelled = false;
    adminApi.listEmployeeActivities(id, { ...range, page: activitiesPage, limit: 15 }).then((result) => !cancelled && setActivities(result)).catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, rangeKey, customFrom, customTo, activitiesPage]);

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/admin/onboarding-analytics/employees" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"><ArrowLeft className="h-4 w-4" /> Back to Employee Performance</Link>
        <Alert tone="error">{error}</Alert>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto">
      <Link to="/admin/onboarding-analytics/employees" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"><ArrowLeft className="h-4 w-4" /> Back to Employee Performance</Link>

      {!employee ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <PageHeader
          title={employee.name}
          description={`${employee.email} · ID ${employee.id}${employee.phone ? ` · ${employee.phone}` : ''}`}
          actions={<div className="flex flex-wrap gap-1">{employee.roles.map((r) => <Badge key={r} tone="neutral">{roleLabel(r)}</Badge>)}</div>}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <RangeSelector ranges={RANGES} value={rangeKey} onChange={setRangeKey} />
        {rangeKey === 'custom' && (
          <div className="flex items-center gap-2">
            <Input aria-label="From date" type="date" value={customFrom} onChange={(e) => setCustom(e.target.value, customTo)} />
            <span className="text-sm text-[var(--text-muted)]">to</span>
            <Input aria-label="To date" type="date" value={customTo} onChange={(e) => setCustom(customFrom, e.target.value)} />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {employee ? (
          <>
            <StatCard icon={Building2} tone="navy" label="Total Hotels Onboarded" value={employee.onboarded} />
            <StatCard icon={CheckCircle2} tone="green" label="Approved Hotels" value={employee.approved} />
            <StatCard icon={Clock3} tone="gold" label="Pending Hotels" value={employee.pending} />
            <StatCard icon={AlertTriangle} tone="red" label="Changes Requested" value={employee.changesRequested} />
            <StatCard icon={PencilLine} tone="blue" label="Total Hotels Edited" value={employee.hotelsEdited} />
            <StatCard icon={PencilLine} tone="purple" label="Total Modification Activities" value={employee.totalModifications} />
          </>
        ) : (
          Array.from({ length: 6 }, (_, i) => <Card key={i} className="p-5"><Skeleton className="h-20 w-full" /></Card>)
        )}
      </div>

      <Card className="p-5 sm:p-6">
        {employee ? (
          <TrendChart
            data={employee.monthlyOnboarding}
            dataKey="count"
            xKey="month"
            label="Monthly Onboarding Performance"
            gradientId={`employee-${id}-monthly`}
            labelFormatter={monthLabel}
            valueFormatter={(v) => `${v} hotel${v === 1 ? '' : 's'}`}
            emptyLabel="No hotels were onboarded in this period."
          />
        ) : <Skeleton className="h-64 w-full" />}
      </Card>

      <Card className="p-5 sm:p-6">
        <h3 className="mb-4 text-sm font-semibold text-[var(--text-strong)]">Hotel-wise Activity History</h3>
        {activities === null ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : activities.items.length === 0 ? (
          <EmptyState title="No activity in this range" />
        ) : (
          <>
            <ul className="divide-y divide-[var(--border-subtle)]">
              {activities.items.map((entry) => <ActivityRow key={entry.id} entry={entry} />)}
            </ul>
            {activities.pagination.totalPages > 1 && <Pagination page={activities.pagination.page} totalPages={activities.pagination.totalPages} onPageChange={setActivitiesPage} />}
          </>
        )}
      </Card>
    </div>
  );
}
