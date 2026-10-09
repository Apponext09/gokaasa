import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, Tag } from 'lucide-react';
import { Card, Skeleton, Alert, Badge } from '@/components/ui/surfaces.jsx';
import { Input, Select } from '@/components/ui/form-controls.jsx';
import { Button } from '@/components/ui/button.jsx';
import { EmptyState, Pagination, PageHeader, formatDateTime } from '@/components/shared/index.jsx';
import { minorToRupees } from '@/features/rooms/roomForm.js';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

function discountLabel(coupon) {
  return coupon.discountType === 'PERCENT' ? `${coupon.discountValue}% off` : `₹${minorToRupees(coupon.discountValue)} off`;
}

export function OffersPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const isActive = params.get('isActive') ?? '';
  const page = Number(params.get('page')) || 1;
  const [searchText, setSearchText] = useState(q);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value == null) next.delete(key);
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
      .listCoupons({ page, limit: 20, ...(q && { q }), ...(isActive && { isActive }) })
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => { cancelled = true; };
  }, [q, isActive, page]);

  const hasFilters = Boolean(q || isActive);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offers & Coupons"
        description="Discount codes customers can apply at checkout."
        actions={<Link to="/admin/offers/new"><Button size="sm"><Plus className="h-3.5 w-3.5" aria-hidden="true" /> New coupon</Button></Link>}
      />

      <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
          <Input aria-label="Search by code" placeholder="Coupon code" className="pl-9" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </div>
        <Select aria-label="Filter by status" value={isActive} onChange={(e) => update({ isActive: e.target.value, page: null })}>
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </Select>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="overflow-hidden">
        {data === null && !error ? (
          <div className="space-y-3 p-5">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-14 w-full" />)}</div>
        ) : data?.items.length === 0 ? (
          <EmptyState icon={Tag} title={hasFilters ? 'No coupons match these filters' : 'No coupons yet'} description={hasFilters ? 'Try changing or clearing your filters.' : 'Create your first coupon to get started.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <caption className="sr-only">Coupons</caption>
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]/60 text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Code</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Discount</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Validity</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Usage</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {data?.items.map((c) => (
                  <tr key={c.id} className="hover:bg-[var(--surface-muted)]/50">
                    <td className="px-4 py-3">
                      <Link to={`/admin/offers/${c.id}`} className="font-mono font-medium text-[var(--text-strong)] hover:text-brand-700">{c.code}</Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-body)]">{discountLabel(c)}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{formatDateTime(c.validFrom)} → {formatDateTime(c.validTo)}</td>
                    <td className="px-4 py-3 text-[var(--text-body)]">{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                    <td className="px-4 py-3"><Badge tone={c.isActive ? 'success' : 'neutral'}>{c.isActive ? 'Active' : 'Inactive'}</Badge></td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{formatDateTime(c.createdAt)}</td>
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
