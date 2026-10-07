import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CalendarCheck, IndianRupee, Timer, Users, BedDouble, Search, ClipboardCheck, CircleAlert, Rocket } from 'lucide-react';
import { Alert, Card, CardContent, Skeleton } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { PageHeader, formatMoney } from '@/components/shared/index.jsx';
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

export function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    adminApi
      .dashboard()
      .then(setData)
      .catch((err) => setError(normalizeError(err).message));
  }, []);

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
          <StatCard icon={Users} label="Customers" value={customers.total} />
          <StatCard icon={CalendarCheck} label="Bookings" value={bookings.total} hint={`${bookings.today} created today`} />
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
