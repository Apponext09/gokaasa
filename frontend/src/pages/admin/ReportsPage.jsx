import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, TrendingUp } from 'lucide-react';
import { Card, Skeleton, Alert, Badge } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Select } from '@/components/ui/form-controls.jsx';
import { PageHeader, formatMoney } from '@/components/shared/index.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { downloadBlob } from '@/lib/utils.js';
import { BOOKING_STATUS_LABEL } from '@/features/booking/bookingFormat.js';

const isoDaysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const isoToday = () => new Date().toISOString().slice(0, 10);

const EXPORT_REPORTS = [
  { key: 'bookings', label: 'Booking Report', description: 'Every booking matching the filters below.', hasStatus: 'booking' },
  { key: 'bookings', label: 'Cancellation Report', description: 'Bookings that were cancelled or refunded.', presetStatus: 'CANCELLED' },
  { key: 'payments', label: 'Payment Report', description: 'Every payment attempt and its outcome.', hasStatus: 'payment' },
  { key: 'refunds', label: 'Refund Report', description: 'Every refund, its reason and status.', hasStatus: 'refund' },
  { key: 'customers', label: 'Customer Report', description: 'The customer directory with lifetime spend.' },
  { key: 'hotels', label: 'Hotel Report', description: 'Every hotel, its status, rating and room count.' },
  { key: 'reviews', label: 'Review Report', description: 'Every review and its moderation status.', hasStatus: 'review' },
];

const STATUS_OPTIONS = {
  booking: Object.keys(BOOKING_STATUS_LABEL),
  payment: ['CREATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'],
  refund: ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'],
  review: ['PENDING', 'APPROVED', 'REJECTED', 'HIDDEN'],
};

function ExportCard({ report }) {
  const [status, setStatus] = useState(report.presetStatus ?? '');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    setDownloading(true);
    setError(null);
    try {
      const params = {};
      if (status) params.status = status;
      const blob = await adminApi.exportCsv(report.key, params);
      downloadBlob(blob, `${report.key}.csv`);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div>
        <h3 className="font-semibold text-[var(--text-strong)]">{report.label}</h3>
        <p className="text-sm text-[var(--text-muted)]">{report.description}</p>
      </div>
      {report.hasStatus && !report.presetStatus && (
        <Select aria-label={`${report.label} status filter`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS[report.hasStatus].map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      )}
      {error && <p role="alert" className="text-xs text-danger-600">{error}</p>}
      <Button variant="secondary" size="sm" onClick={run} loading={downloading} className="self-start">
        <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export CSV
      </Button>
    </Card>
  );
}

const SORTS = [
  { value: 'revenue_desc', label: 'Revenue (high to low)' },
  { value: 'bookings_desc', label: 'Bookings (high to low)' },
  { value: 'rating_desc', label: 'Rating (high to low)' },
];

function HotelPerformanceTable() {
  const [range] = useState({ from: isoDaysAgo(29), to: isoToday() });
  const [sort, setSort] = useState('revenue_desc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    adminApi
      .hotelPerformance({ ...range, sort, page, limit: 10 })
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => {
      cancelled = true;
    };
  }, [sort, page, range]);

  return (
    <Card className="admin-records-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] p-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-strong)]">Hotel Performance</h2>
          <p className="text-xs text-[var(--text-muted)]">Last 30 days ({range.from} → {range.to})</p>
        </div>
        <Select aria-label="Sort hotel performance" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className="max-w-[12rem]">
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </div>
      {error && <Alert tone="error" className="m-4">{error}</Alert>}
      {!error && data === null && <div className="space-y-2 p-4">{[0, 1, 2].map((r) => <Skeleton key={r} className="h-10 w-full" />)}</div>}
      {data?.items.length === 0 && <p className="p-5 text-sm text-[var(--text-muted)]">No bookings in this range yet.</p>}
      {data?.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Hotel performance</caption>
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]/60 text-xs uppercase tracking-wide text-[var(--text-muted)]">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Hotel</th>
                <th scope="col" className="px-4 py-3 font-semibold">Bookings</th>
                <th scope="col" className="px-4 py-3 font-semibold">Revenue</th>
                <th scope="col" className="px-4 py-3 font-semibold">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {data.items.map((hotel) => (
                <tr key={hotel.id} className="hover:bg-[var(--surface-muted)]/50">
                  <td className="px-4 py-3">
                    <Link to={`/admin/hotels/${hotel.id}`} className="font-medium text-[var(--text-strong)] hover:text-brand-700">{hotel.name}</Link>
                    <p className="text-xs text-[var(--text-muted)]">{hotel.city}</p>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-body)]">{hotel.bookings}</td>
                  <td className="px-4 py-3 font-medium text-[var(--text-strong)]">{formatMoney(hotel.revenueMinor)}</td>
                  <td className="px-4 py-3 text-[var(--text-body)]">{hotel.guestRating != null ? `${hotel.guestRating.toFixed(1)} ★` : <Badge tone="neutral">New</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] p-4 text-sm">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-[var(--text-muted)]">Page {data.pagination.page} of {data.pagination.totalPages}</span>
          <Button variant="secondary" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </Card>
  );
}

export function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Operational reports built from live booking, payment and review data -- never a static snapshot." />

      <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-4 text-sm text-[var(--text-body)]">
        <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
        <p>For revenue-over-time charts and the booking-status breakdown, see the <Link to="/admin/dashboard" className="font-medium text-brand-700 hover:underline">Dashboard</Link>. Reports here focus on hotel-level performance and CSV exports.</p>
      </div>

      <HotelPerformanceTable />

      <div>
        <h2 className="mb-3 text-base font-semibold text-[var(--text-strong)]">Export reports</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {EXPORT_REPORTS.map((report, index) => <ExportCard key={`${report.key}-${index}`} report={report} />)}
        </div>
      </div>
    </div>
  );
}
