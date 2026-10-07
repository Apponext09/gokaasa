import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Badge, Card } from '@/components/ui/surfaces.jsx';
import { EmptyState, FullPageSpinner } from '@/components/shared/index.jsx';
import { SafeImage } from '@/components/shared/SafeImage.jsx';
import { CancelBookingDialog } from '@/features/booking/components/CancelBookingDialog.jsx';
import { ReviewCta } from '@/features/reviews/ReviewCta.jsx';
import { BOOKING_STATUS_LABEL, formatMoneyMinor, formatStayDate, occupancyLabel } from '@/features/booking/bookingFormat.js';
import { downloadInvoice } from '@/features/booking/invoice.js';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';
import { normalizeError } from '@/services/api.js';
import { bookingApi } from '@/services/endpoints.js';

const REFUND_LABEL = { PENDING: 'Refund pending', PROCESSING: 'Refund processing', SUCCESS: 'Refunded', FAILED: 'Refund failed, we are retrying' };

/** One trip, read from its snapshot. Dates, prices and the cancellation policy never change after booking. */
export function BookingDetailsPage() {
  const { bookingId } = useParams();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useDocumentMeta({ title: 'Trip details | Gokaasa', description: 'Details of your Gokaasa booking.' });

  useEffect(() => {
    let active = true;
    bookingApi
      .myBooking(bookingId)
      .then((result) => active && setBooking(result))
      .catch((err) => active && setError(normalizeError(err).message));
    return () => {
      active = false;
    };
  }, [bookingId, reloadKey]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState title="We couldn't find this trip" description={error} action={<Link to="/my-trips"><Button>Back to My Trips</Button></Link>} />
      </div>
    );
  }
  if (!booking) return <FullPageSpinner label="Loading your trip" />;

  const status = BOOKING_STATUS_LABEL[booking.status] ?? BOOKING_STATUS_LABEL.PAYMENT_PENDING;
  const money = (minor) => formatMoneyMinor(minor, booking.amounts.currency);
  const canCancel = booking.status === 'CONFIRMED' && booking.cancellation.preview?.canCancel;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <Link to="/my-trips" className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-strong)]">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> My trips
      </Link>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            <span className="font-mono text-sm text-[var(--text-muted)]">{booking.bookingRef}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">{booking.hotel.name}</h1>
          <p className="text-sm text-[var(--text-muted)]">{booking.hotel.address}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {booking.status === 'CONFIRMED' && (
            <Button variant="secondary" size="sm" onClick={() => downloadInvoice(booking)}>
              <Download className="h-4 w-4" aria-hidden="true" /> Invoice
            </Button>
          )}
          {canCancel && (
            <Button variant="danger-outline" size="sm" onClick={() => setCancelOpen(true)}>
              Cancel booking
            </Button>
          )}
          <ReviewCta
            bookingId={booking.id}
            review={booking.review}
            onChanged={(review) => setBooking((b) => ({ ...b, review }))}
          />
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="aspect-[16/9] bg-[var(--surface-muted)]">
            <SafeImage src={booking.hotel.imageUrl} alt={booking.hotel.name} className="h-full w-full object-cover" />
          </div>
          <dl className="space-y-3 p-5 text-sm">
            <Field label="Dates" value={`${formatStayDate(booking.stay.checkIn)} → ${formatStayDate(booking.stay.checkOut)} (${booking.stay.nights} night${booking.stay.nights === 1 ? '' : 's'})`} />
            <Field label="Rooms" value={booking.rooms.map((room) => `${room.quantity} × ${room.name} (${room.mealPlan.replace(/_/g, ' ').toLowerCase()})`).join(', ')} />
            <Field label="Rate" value={booking.rooms[0]?.ratePlanName} />
            <Field label="Guests" value={`${occupancyLabel(roomsFrom(booking))}`} />
          </dl>
        </Card>

        <Card className="space-y-4 p-5 text-sm">
          <div>
            <p className="font-medium text-[var(--text-strong)]">Guests</p>
            <ul className="mt-1 space-y-0.5 text-[var(--text-body)]">
              {booking.guests.map((guest) => (
                <li key={`${guest.roomIndex}-${guest.name}`}>
                  {guest.name}, {guest.age} · Room {guest.roomIndex + 1}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium text-[var(--text-strong)]">Contact</p>
            <p className="text-[var(--text-body)]">
              {booking.primaryContact.firstName} {booking.primaryContact.lastName} · {booking.primaryContact.email} · {booking.primaryContact.mobile}
            </p>
          </div>
          {booking.companyName && <Field label="Company" value={booking.companyName} />}
          {booking.gstNumber && <Field label="GST" value={booking.gstNumber} />}
          {booking.specialRequest && <Field label="Special requests" value={booking.specialRequest} />}
        </Card>
      </div>

      <Card className="space-y-3 p-5 text-sm">
        <h2 className="text-base font-semibold text-[var(--text-strong)]">Payment</h2>
        <dl className="space-y-3">
          <Field label="Subtotal" value={money(booking.amounts.subtotal)} />
          {booking.amounts.discount > 0 && <Field label="Discount" value={`−${money(booking.amounts.discount)}`} />}
          <Field label="Taxes" value={money(booking.amounts.taxes)} />
          <Field label="Fees" value={money(booking.amounts.fees)} />
          <Field label="Total" value={money(booking.amounts.total)} strong />
          <Field label="Paid" value={money(booking.amounts.paid)} />
          {booking.payment && <Field label="Payment ID" value={booking.payment.id ?? '—'} mono />}
          {booking.refunds.map((refund) => (
            <Field key={refund.id} label={REFUND_LABEL[refund.status] ?? refund.status} value={money(refund.amount)} />
          ))}
        </dl>
      </Card>

      <Card className="space-y-2 p-5 text-sm">
        <h2 className="text-base font-semibold text-[var(--text-strong)]">Cancellation policy</h2>
        <p className="text-[var(--text-body)]">{booking.cancellation.description}</p>
        <p className="text-xs text-[var(--text-muted)]">This is the policy your booking was made under. Later changes at the hotel do not apply to it.</p>
        {booking.cancellation.preview && booking.cancellation.preview.canCancel && (
          <p className="text-[var(--text-body)]">
            Cancelling now refunds {money(booking.cancellation.preview.refundMinor)}.
          </p>
        )}
      </Card>

      <CancelBookingDialog
        bookingId={booking.id}
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onCancelled={() => setReloadKey((key) => key + 1)}
      />
    </div>
  );
}

function roomsFrom(booking) {
  const rooms = new Map();
  for (const guest of booking.guests) {
    const room = rooms.get(guest.roomIndex) ?? { adults: 0, childAges: [] };
    if (guest.age < 18) room.childAges.push(guest.age);
    else room.adults += 1;
    rooms.set(guest.roomIndex, room);
  }
  return [...rooms.values()];
}

function Field({ label, value, strong, mono }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-[var(--text-muted)]">{label}</dt>
      <dd className={`text-right ${strong ? 'font-semibold text-[var(--text-strong)]' : 'text-[var(--text-body)]'} ${mono ? 'font-mono text-xs' : ''} break-all`}>{value}</dd>
    </div>
  );
}
