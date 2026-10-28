import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, FileText, Search } from 'lucide-react';
import { Card, Alert, Badge } from '@/components/ui/surfaces.jsx';
import { Select, Input } from '@/components/ui/form-controls.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableSkeleton } from '@/components/ui/table.jsx';
import { EmptyState, Pagination, PageHeader, formatMoney, formatDateTime } from '@/components/shared/index.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { downloadBlob } from '@/lib/utils.js';

const PAYMENT_STATUS_TONE = { CREATED: 'neutral', PENDING: 'warning', SUCCESS: 'success', FAILED: 'danger', REFUNDED: 'neutral' };

/**
 * A booking with a captured payment has an invoice. This page is a search/filter view over the same
 * booking list the Bookings page uses, with a per-row download reusing the existing invoice PDF
 * endpoint -- there is no separate invoice store or generator.
 */
export function InvoicesPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const paymentStatus = params.get('paymentStatus') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Number(params.get('page')) || 1;
  const [searchText, setSearchText] = useState(q);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

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

  const filterParams = { ...(q && { q }), ...(paymentStatus && { paymentStatus }), ...(from && { from }), ...(to && { to }) };

  useEffect(() => {
    let cancelled = false;
    setError(null);
    adminApi
      .listBookings({ page, limit: 20, sort: 'created_desc', ...filterParams })
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, paymentStatus, from, to, page]);

  const downloadInvoice = async (booking) => {
    setDownloadingId(booking.id);
    try {
      const blob = await adminApi.invoiceBlob(booking.id);
      downloadBlob(blob, `${booking.bookingRef}-invoice.pdf`);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setDownloadingId(null);
    }
  };

  const hasFilters = Boolean(q || paymentStatus || from || to);

  return (
    <div className="admin-table-page flex h-full min-h-0 flex-col gap-6">
      <PageHeader title="Invoices" description="Search and download invoices for any booking with a captured payment." />

      <Card className="filter-panel grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-12">
        <div className="relative sm:col-span-2 xl:col-span-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
          <Input aria-label="Search by reference, name or email" placeholder="Booking ref, customer name or email" className="pl-9" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </div>
        <Select aria-label="Filter by payment status" value={paymentStatus} onChange={(e) => update({ paymentStatus: e.target.value, page: null })} className="xl:col-span-3">
          <option value="">All payment statuses</option>
          <option value="SUCCESS">Paid</option>
          <option value="REFUNDED">Refunded</option>
        </Select>
        <Input aria-label="From date" type="date" value={from} onChange={(e) => update({ from: e.target.value, page: null })} className="xl:col-span-2" />
        <Input aria-label="To date" type="date" value={to} onChange={(e) => update({ to: e.target.value, page: null })} className="xl:col-span-2" />
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="admin-records-card min-h-0 flex-1 overflow-hidden">
        {data === null && !error ? (
          <TableSkeleton rows={3} />
        ) : data?.items.length === 0 ? (
          <EmptyState icon={FileText} title={hasFilters ? 'No invoices match these filters' : 'No invoices yet'} description={hasFilters ? 'Try changing or clearing your filters.' : 'Invoices appear here once a booking is paid.'} />
        ) : (
          <Table minWidth="800px">
            <caption className="sr-only">Invoices</caption>
            <TableHeader>
              <tr>
                <TableHead>Booking</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Hotel</TableHead>
                <TableHead>Amount paid</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Invoice</TableHead>
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
                  <TableCell className="text-[var(--text-body)]">{b.hotel.name}</TableCell>
                  <TableCell className="text-[var(--text-strong)]">{formatMoney(b.amounts.paid, b.amounts.currency)}</TableCell>
                  <TableCell><Badge tone={PAYMENT_STATUS_TONE[b.paymentStatus] ?? 'neutral'}>{b.paymentStatus}</Badge></TableCell>
                  <TableCell className="text-[var(--text-muted)]">{formatDateTime(b.createdAt)}</TableCell>
                  <TableCell>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={b.amounts.paid <= 0}
                      loading={downloadingId === b.id}
                      onClick={() => downloadInvoice(b)}
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" /> Download
                    </Button>
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
