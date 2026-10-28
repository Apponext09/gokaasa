import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarCheck, Download, Search } from 'lucide-react';
import { Card, Alert, Badge } from '@/components/ui/surfaces.jsx';
import { Input, Select } from '@/components/ui/form-controls.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableSkeleton } from '@/components/ui/table.jsx';
import { EmptyState, Pagination, PageHeader, formatMoney } from '@/components/shared/index.jsx';
import { BOOKING_STATUS_LABEL } from '@/features/booking/bookingFormat.js';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { downloadBlob } from '@/lib/utils.js';

const STATUS_OPTIONS = Object.keys(BOOKING_STATUS_LABEL);

const FILTER_KEYS = ['q', 'status', 'sort', 'page'];

function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) ?? '']));
  const update = (changes, { resetPage = true } = {}) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value == null) next.delete(key);
      else next.set(key, String(value));
    }
    if (resetPage && !('page' in changes)) next.delete('page');
    setParams(next);
  };
  return [filters, update];
}

export function BookingsPage() {
  const [filters, updateFilters] = useFilters();
  const [searchText, setSearchText] = useState(filters.q);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchText !== filters.q) updateFilters({ q: searchText.trim() });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    adminApi
      .listBookings({
        page: Number(filters.page) || 1,
        limit: 20,
        sort: filters.sort || 'created_desc',
        ...(filters.q && { q: filters.q }),
        ...(filters.status && { status: filters.status }),
      })
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => {
      cancelled = true;
    };
  }, [filters.q, filters.status, filters.sort, filters.page]);

  const hasFilters = Boolean(filters.q || filters.status);
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await adminApi.exportCsv('bookings', { ...(filters.q && { q: filters.q }), ...(filters.status && { status: filters.status }) });
      downloadBlob(blob, 'bookings.csv');
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="admin-table-page flex h-full min-h-0 flex-col gap-6">
      <PageHeader
        title="Bookings"
        description="Every booking across your hotels, with its current payment and booking status."
        actions={<Button variant="secondary" size="sm" onClick={exportCsv} loading={exporting}><Download className="h-3.5 w-3.5" aria-hidden="true" /> Export CSV</Button>}
      />

      <Card className="filter-panel grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
          <Input aria-label="Search by reference, name or email" placeholder="Booking ref, customer name or email" className="pl-9" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </div>
        <Select aria-label="Filter by status" value={filters.status} onChange={(e) => updateFilters({ status: e.target.value })}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>{BOOKING_STATUS_LABEL[status].label}</option>
          ))}
        </Select>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="admin-records-card min-h-0 flex-1 overflow-hidden">
        {data === null && !error ? (
          <TableSkeleton rows={4} />
        ) : data?.items.length === 0 ? (
          <EmptyState icon={CalendarCheck} title={hasFilters ? 'No bookings match these filters' : 'No bookings yet'} description={hasFilters ? 'Try changing or clearing your filters.' : 'Bookings will appear here once guests start booking.'} />
        ) : (
          <Table minWidth="820px" wrapperClassName="h-full overflow-auto">
            <caption className="sr-only">Bookings</caption>
            <TableHeader className="sticky top-0 z-10">
              <tr>
                <TableHead>Booking</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Hotel</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {data?.items.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <Link to={`/admin/bookings/${b.id}`} className="font-medium text-[var(--text-strong)] hover:text-brand-700">{b.bookingRef}</Link>
                  </TableCell>
                  <TableCell className="text-[var(--text-body)]">
                    <p>{b.customer.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{b.customer.email}</p>
                  </TableCell>
                  <TableCell className="text-[var(--text-body)]">
                    <p>{b.hotel.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{b.hotel.city}</p>
                  </TableCell>
                  <TableCell className="text-[var(--text-muted)]">{b.checkIn} → {b.checkOut}</TableCell>
                  <TableCell className="text-[var(--text-strong)]">{formatMoney(b.amounts.total, b.amounts.currency)}</TableCell>
                  <TableCell><Badge tone={BOOKING_STATUS_LABEL[b.status]?.tone ?? 'neutral'}>{BOOKING_STATUS_LABEL[b.status]?.label ?? b.status}</Badge></TableCell>
                  <TableCell className="text-[var(--text-muted)]">{new Date(b.createdAt).toLocaleDateString('en-IN')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {data && <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={(page) => updateFilters({ page }, { resetPage: false })} />}
    </div>
  );
}
