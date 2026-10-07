import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { Card, Skeleton, Alert, Badge } from '@/components/ui/surfaces.jsx';
import { Select } from '@/components/ui/form-controls.jsx';
import { EmptyState, Pagination, PageHeader, formatMoney, formatDateTime } from '@/components/shared/index.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const STATUS_TONE = { CREATED: 'neutral', PENDING: 'warning', SUCCESS: 'success', FAILED: 'danger', REFUNDED: 'neutral' };
const STATUSES = ['CREATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'];

export function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const page = Number(params.get('page')) || 1;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (!value) next.delete(key);
      else next.set(key, String(value));
    }
    setParams(next);
  };

  useEffect(() => {
    let cancelled = false;
    setError(null);
    adminApi
      .listPayments({ page, limit: 20, ...(status && { status }) })
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => { cancelled = true; };
  }, [status, page]);

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Every payment attempt across your hotels." />

      <Card className="flex flex-wrap gap-3 p-4">
        <Select aria-label="Filter by status" value={status} onChange={(e) => update({ status: e.target.value, page: null })} className="max-w-xs">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="overflow-hidden">
        {data === null && !error ? (
          <div className="space-y-3 p-5">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-14 w-full" />)}</div>
        ) : data?.items.length === 0 ? (
          <EmptyState icon={Wallet} title="No payments found" description="Try a different filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">Payments</caption>
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]/60 text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Booking</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Hotel</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Amount</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {data?.items.map((p) => (
                  <tr key={p.id} className="hover:bg-[var(--surface-muted)]/50">
                    <td className="px-4 py-3"><Link to={`/admin/bookings/${p.bookingId}`} className="font-medium text-[var(--text-strong)] hover:text-brand-700">{p.bookingRef}</Link></td>
                    <td className="px-4 py-3 text-[var(--text-body)]"><p>{p.customer.name}</p><p className="text-xs text-[var(--text-muted)]">{p.customer.email}</p></td>
                    <td className="px-4 py-3 text-[var(--text-body)]">{p.hotelName}</td>
                    <td className="px-4 py-3 text-[var(--text-strong)]">{formatMoney(p.amountMinor, p.currency)}</td>
                    <td className="px-4 py-3"><Badge tone={STATUS_TONE[p.status] ?? 'neutral'}>{p.status}</Badge></td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{formatDateTime(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data && <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={(p) => update({ page: p })} />}
    </div>
  );
}
