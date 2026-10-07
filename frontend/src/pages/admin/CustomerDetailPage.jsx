import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Skeleton, Badge } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { EmptyState, PageHeader, formatMoney } from '@/components/shared/index.jsx';
import { BOOKING_STATUS_LABEL } from '@/features/booking/bookingFormat.js';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

export function CustomerDetailPage() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    setError(null);
    adminApi.getCustomer(id).then(setCustomer).catch((err) => setError(normalizeError(err).message));
  };
  useEffect(load, [id]);

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/admin/customers" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"><ArrowLeft className="h-4 w-4" /> Back to customers</Link>
        <EmptyState title="We couldn't load this customer" description={error} action={<Button onClick={load}>Try again</Button>} />
      </div>
    );
  }
  if (!customer) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-6">
      <Link to="/admin/customers" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"><ArrowLeft className="h-4 w-4" /> Back to customers</Link>
      <PageHeader title={customer.name || customer.email} description={customer.email} actions={!customer.isActive && <Badge tone="danger">Inactive</Badge>} />

      <Card>
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent className="grid gap-2 pt-0 sm:grid-cols-2">
          <p className="text-sm"><span className="text-[var(--text-muted)]">Phone: </span><span className="font-medium text-[var(--text-strong)]">{customer.phone ?? '—'}</span></p>
          <p className="text-sm"><span className="text-[var(--text-muted)]">Joined: </span><span className="font-medium text-[var(--text-strong)]">{new Date(customer.joinedAt).toLocaleDateString('en-IN')}</span></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Bookings</CardTitle></CardHeader>
        <CardContent className="pt-0">
          {customer.bookings.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No bookings yet.</p>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {customer.bookings.map((b) => (
                <Link key={b.id} to={`/admin/bookings/${b.id}`} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-brand-700">
                  <div>
                    <p className="font-medium text-[var(--text-strong)]">{b.bookingRef}</p>
                    <p className="text-xs text-[var(--text-muted)]">{b.hotel.name} · {b.checkIn} → {b.checkOut}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-[var(--text-strong)]">{formatMoney(b.amounts.total, b.amounts.currency)}</span>
                    <Badge tone={BOOKING_STATUS_LABEL[b.status]?.tone ?? 'neutral'}>{BOOKING_STATUS_LABEL[b.status]?.label ?? b.status}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {customer.refunds.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Refunds</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y divide-[var(--border-subtle)]">
              {customer.refunds.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-3 text-sm">
                  <span className="text-[var(--text-body)]">{r.bookingRef}</span>
                  <span className="font-medium text-[var(--text-strong)]">{formatMoney(r.amountMinor)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
