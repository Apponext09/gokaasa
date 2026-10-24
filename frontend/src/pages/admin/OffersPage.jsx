import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Pencil, Plus, Search, Tag } from 'lucide-react';
import { Card, Alert, Badge } from '@/components/ui/surfaces.jsx';
import { Input, Select } from '@/components/ui/form-controls.jsx';
import { buttonVariants } from '@/components/ui/button.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableSkeleton } from '@/components/ui/table.jsx';
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
        actions={<Link to="/admin/offers/new" className={buttonVariants({ size: 'sm' })}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> New coupon</Link>}
      />

      <Card className="filter-panel grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
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
          <TableSkeleton rows={3} />
        ) : data?.items.length === 0 ? (
          <EmptyState icon={Tag} title={hasFilters ? 'No coupons match these filters' : 'No coupons yet'} description={hasFilters ? 'Try changing or clearing your filters.' : 'Create your first coupon to get started.'} />
        ) : (
          <Table minWidth="800px">
            <caption className="sr-only">Coupons</caption>
            <TableHeader>
              <tr>
                <TableHead>Code</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Validity</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {data?.items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link to={`/admin/offers/${c.id}`} className="font-mono font-medium text-[var(--text-strong)] hover:text-brand-700">{c.code}</Link>
                  </TableCell>
                  <TableCell className="text-[var(--text-body)]">{discountLabel(c)}</TableCell>
                  <TableCell className="text-[var(--text-muted)]">{formatDateTime(c.validFrom)} → {formatDateTime(c.validTo)}</TableCell>
                  <TableCell className="text-[var(--text-body)]">{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</TableCell>
                  <TableCell><Badge tone={c.isActive ? 'success' : 'neutral'}>{c.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                  <TableCell className="text-[var(--text-muted)]">{formatDateTime(c.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Link
                      to={`/admin/offers/${c.id}`}
                      aria-label={`Edit coupon ${c.code}`}
                      className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {data && <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={(p) => update({ page: p })} />}
    </div>
  );
}
