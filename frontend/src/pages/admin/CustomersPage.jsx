import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Search, Users } from 'lucide-react';
import { Card, Skeleton, Alert, Badge } from '@/components/ui/surfaces.jsx';
import { Input } from '@/components/ui/form-controls.jsx';
import { Button } from '@/components/ui/button.jsx';
import { EmptyState, Pagination, PageHeader, formatMoney } from '@/components/shared/index.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { downloadBlob } from '@/lib/utils.js';

export function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const page = Number(params.get('page')) || 1;
  const [searchText, setSearchText] = useState(q);
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
    const timer = setTimeout(() => {
      if (searchText !== q) update({ q: searchText.trim(), page: null });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    adminApi
      .listCustomers({ page, limit: 20, ...(q && { q }) })
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => { cancelled = true; };
  }, [q, page]);

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await adminApi.exportCsv('customers', { ...(q && { q }) });
      downloadBlob(blob, 'customers.csv');
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Guests who have booked at your hotels."
        actions={<Button variant="secondary" size="sm" onClick={exportCsv} loading={exporting}><Download className="h-3.5 w-3.5" aria-hidden="true" /> Export CSV</Button>}
      />

      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
          <Input aria-label="Search customers" placeholder="Name, email or phone" className="pl-9" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="overflow-hidden">
        {data === null && !error ? (
          <div className="space-y-3 p-5">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-14 w-full" />)}</div>
        ) : data?.items.length === 0 ? (
          <EmptyState icon={Users} title={q ? 'No customers match this search' : 'No customers yet'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="sr-only">Customers</caption>
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]/60 text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Bookings</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Total spend</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Last booking</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {data?.items.map((c) => (
                  <tr key={c.id} className="hover:bg-[var(--surface-muted)]/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link to={`/admin/customers/${c.id}`} className="font-medium text-[var(--text-strong)] hover:text-brand-700">{c.name || c.email}</Link>
                        {!c.isActive && <Badge tone="danger">Inactive</Badge>}
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">{c.email}</p>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-body)]">{c.bookingsCount}</td>
                    <td className="px-4 py-3 text-[var(--text-strong)]">{formatMoney(c.totalSpendMinor)}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{c.lastBookingAt ? new Date(c.lastBookingAt).toLocaleDateString('en-IN') : '—'}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{new Date(c.joinedAt).toLocaleDateString('en-IN')}</td>
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
