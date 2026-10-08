import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Skeleton, Alert, Badge } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ConfirmDialog } from '@/components/ui/dialog.jsx';
import { EmptyState, PageHeader, formatMoney, formatDateTime } from '@/components/shared/index.jsx';
import { BOOKING_STATUS_LABEL } from '@/features/booking/bookingFormat.js';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { downloadBlob } from '@/lib/utils.js';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { toast } from 'sonner';

function ActivityTimeline({ entity, entityId }) {
  const [entries, setEntries] = useState(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .listAuditLogs({ entity, entityId, limit: 10 })
      .then((result) => !cancelled && setEntries(result.items))
      .catch(() => !cancelled && setEntries([]));
    return () => {
      cancelled = true;
    };
  }, [entity, entityId]);

  if (entries === null) return <Skeleton className="h-24 w-full" />;
  if (entries.length === 0) return <p className="text-sm text-[var(--text-muted)]">No recorded activity yet.</p>;

  return (
    <ol className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3 text-sm">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" aria-hidden="true" />
          <div>
            <p className="font-medium text-[var(--text-strong)]">{entry.action.replaceAll('.', ' ').replaceAll('_', ' ')}</p>
            <p className="text-xs text-[var(--text-muted)]">{entry.actor ? entry.actor.name : 'System'} · {formatDateTime(entry.createdAt)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="text-right font-medium text-[var(--text-strong)]">{value}</span>
    </div>
  );
}

export function BookingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);

  const load = () => {
    setError(null);
    adminApi.getBooking(id).then(setBooking).catch((err) => setError(normalizeError(err).message));
  };

  useEffect(load, [id]);

  const cancel = async () => {
    setCancelling(true);
    try {
      const updated = await adminApi.cancelBooking(id, { reason: 'Cancelled by staff' });
      setBooking(updated);
      setCancelOpen(false);
      toast.success('Booking cancelled');
    } catch (err) {
      toast.error(normalizeError(err).message);
    } finally {
      setCancelling(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/admin/bookings" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"><ArrowLeft className="h-4 w-4" /> Back to bookings</Link>
        <EmptyState title="We couldn't load this booking" description={error} action={<Button onClick={load}>Try again</Button>} />
      </div>
    );
  }
  if (!booking) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const canCancel = booking.status === 'CONFIRMED';

  const downloadInvoice = async () => {
    setDownloadingInvoice(true);
    try {
      const blob = await adminApi.invoiceBlob(id);
      downloadBlob(blob, `${booking.bookingRef}-invoice.pdf`);
    } catch (err) {
      toast.error(normalizeError(err).message);
    } finally {
      setDownloadingInvoice(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/admin/bookings" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"><ArrowLeft className="h-4 w-4" /> Back to bookings</Link>
      <PageHeader
        title={booking.bookingRef}
        description={`${booking.hotel.name} · ${booking.hotel.city}`}
        actions={
          <>
            <Badge tone={BOOKING_STATUS_LABEL[booking.status]?.tone ?? 'neutral'}>{BOOKING_STATUS_LABEL[booking.status]?.label ?? booking.status}</Badge>
            <Button variant="secondary" size="sm" onClick={downloadInvoice} loading={downloadingInvoice}><Download className="h-3.5 w-3.5" aria-hidden="true" /> Invoice</Button>
            {canCancel && <Button variant="danger-outline" size="sm" onClick={() => setCancelOpen(true)}>Cancel booking</Button>}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Hotel</CardTitle></CardHeader>
          <CardContent className="space-y-1 pt-0">
            <Row label="Name" value={booking.hotel.name} />
            <Row label="City" value={booking.hotel.city} />
            {booking.hotel.address && <Row label="Address" value={booking.hotel.address} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
          <CardContent className="space-y-1 pt-0">
            <Row label="Name" value={booking.primaryContact.firstName + ' ' + booking.primaryContact.lastName} />
            <Row label="Email" value={booking.primaryContact.email} />
            <Row label="Phone" value={booking.primaryContact.mobile} />
            {booking.companyName && <Row label="Company" value={booking.companyName} />}
            {booking.gstNumber && <Row label="GSTIN" value={booking.gstNumber} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Stay</CardTitle></CardHeader>
          <CardContent className="space-y-1 pt-0">
            <Row label="Check-in" value={booking.stay.checkIn} />
            <Row label="Check-out" value={booking.stay.checkOut} />
            <Row label="Nights" value={booking.stay.nights} />
            <Row label="Rooms" value={booking.stay.rooms} />
            <Row label="Guests" value={`${booking.stay.adults} adults${booking.stay.children ? `, ${booking.stay.children} children` : ''}`} />
            {booking.rooms.map((room, i) => <Row key={i} label={room.name} value={`${room.ratePlanName} · ${room.mealPlan.replaceAll('_', ' ')}`} />)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Payment</CardTitle></CardHeader>
          <CardContent className="space-y-1 pt-0">
            <Row label="Payment status" value={booking.paymentStatus} />
            {booking.payment && (
              <>
                <Row label="Provider payment ID" value={booking.payment.id ?? '—'} />
                <Row label="Order ID" value={booking.payment.orderId} />
                <Row label="Paid at" value={booking.payment.paidAt ? formatDateTime(booking.payment.paidAt) : '—'} />
              </>
            )}
            <Row label="Total" value={formatMoney(booking.amounts.total, booking.amounts.currency)} />
            <Row label="Paid" value={formatMoney(booking.amounts.paid, booking.amounts.currency)} />
            {booking.amounts.refunded > 0 && <Row label="Refunded" value={formatMoney(booking.amounts.refunded, booking.amounts.currency)} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Cancellation</CardTitle></CardHeader>
          <CardContent className="space-y-1 pt-0">
            <Row label="Policy" value={booking.cancellation.policyName ?? '—'} />
            <Row label="Deadline" value={booking.cancellation.deadlineAt ? formatDateTime(booking.cancellation.deadlineAt) : '—'} />
            {booking.cancellation.cancelledAt && <Row label="Cancelled at" value={formatDateTime(booking.cancellation.cancelledAt)} />}
            {booking.cancellation.reason && <Row label="Reason" value={booking.cancellation.reason} />}
            {booking.refunds.length > 0 && booking.refunds.map((r) => (
              <Row key={r.id} label={`Refund (${r.status})`} value={formatMoney(r.amount, booking.amounts.currency)} />
            ))}
          </CardContent>
        </Card>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader><CardTitle>Activity</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <ActivityTimeline entity="booking" entityId={booking.id} />
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel this booking?"
        description="The guest will be refunded according to the cancellation policy that applied when they booked. This cannot be undone."
        confirmLabel="Cancel booking"
        tone="danger"
        loading={cancelling}
        onConfirm={cancel}
        onCancel={() => setCancelOpen(false)}
      />
    </div>
  );
}
