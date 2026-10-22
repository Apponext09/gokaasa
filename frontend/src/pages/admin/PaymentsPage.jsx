import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Wallet } from 'lucide-react';
import { Card, Alert, Badge } from '@/components/ui/surfaces.jsx';
import { Select, Input } from '@/components/ui/form-controls.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableSkeleton } from '@/components/ui/table.jsx';
import { EmptyState, Pagination, PageHeader, formatMoney, formatDateTime } from '@/components/shared/index.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { downloadBlob } from '@/lib/utils.js';

const STATUS_TONE = { CREATED: 'neutral', PENDING: 'warning', SUCCESS: 'success', FAILED: 'danger', REFUNDED: 'neutral' };
const STATUSES = ['CREATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'];

export function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Number(params.get('page')) || 1;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (!value) next.delete(key);
      else next.set(key, String(value));
    }
    setParams(next);
  };

  const filterParams = { ...(status && { status }), ...(from && { from }), ...(to && { to }) };

  useEffect(() => {
    let cancelled = false;
    setError(null);
    adminApi
      .listPayments({ page, limit: 20, ...filterParams })
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, from, to, page]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await adminApi.exportCsv('payments', filterParams);
      downloadBlob(blob, 'payments.csv');
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Every payment attempt across your hotels."
        actions={<Button variant="secondary" size="sm" onClick={exportCsv} loading={exporting}><Download className="h-3.5 w-3.5" aria-hidden="true" /> Export CSV</Button>}
      />

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Select aria-label="Filter by status" value={status} onChange={(e) => update({ status: e.target.value, page: null })} className="max-w-xs">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Input aria-label="From date" type="date" value={from} onChange={(e) => update({ from: e.target.value, page: null })} />
        <Input aria-label="To date" type="date" value={to} onChange={(e) => update({ to: e.target.value, page: null })} />
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="overflow-hidden">
        {data === null && !error ? (
          <TableSkeleton rows={3} />
        ) : data?.items.length === 0 ? (
          <EmptyState icon={Wallet} title="No payments found" description="Try a different filter." />
        ) : (
          <Table minWidth="760px">
            <caption className="sr-only">Payments</caption>
            <TableHeader>
              <tr>
                <TableHead>Booking</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Hotel</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {data?.items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell><Link to={`/admin/bookings/${p.bookingId}`} className="font-medium text-[var(--text-strong)] hover:text-brand-700">{p.bookingRef}</Link></TableCell>
                  <TableCell className="text-[var(--text-body)]"><p>{p.customer.name}</p><p className="text-xs text-[var(--text-muted)]">{p.customer.email}</p></TableCell>
                  <TableCell className="text-[var(--text-body)]">{p.hotelName}</TableCell>
                  <TableCell className="text-[var(--text-strong)]">{formatMoney(p.amountMinor, p.currency)}</TableCell>
                  <TableCell><Badge tone={STATUS_TONE[p.status] ?? 'neutral'}>{p.status}</Badge></TableCell>
                  <TableCell className="text-[var(--text-muted)]">{formatDateTime(p.createdAt)}</TableCell>
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
