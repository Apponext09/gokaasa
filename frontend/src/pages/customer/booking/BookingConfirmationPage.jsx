import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Download, Luggage } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/surfaces.jsx';
import { EmptyState, FullPageSpinner } from '@/components/shared/index.jsx';
import { SafeImage } from '@/components/shared/SafeImage.jsx';
import { BookingProgress } from '@/features/booking/components/BookingProgress.jsx';
import { BOOKING_STATUS_LABEL, formatMoneyMinor, formatStayDate, occupancyLabel } from '@/features/booking/bookingFormat.js';
import { clearSelection } from '@/features/booking/selection.js';
import { downloadInvoice } from '@/features/booking/invoice.js';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';
import { normalizeError } from '@/services/api.js';
import { bookingApi } from '@/services/endpoints.js';

/** Step 6: the booking as the server stored it. Everything shown is the snapshot taken at booking time. */
export function BookingConfirmationPage() {
  const { bookingId } = useParams();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState(null);

  useDocumentMeta({ title: 'Booking confirmed | Gokaasa', description: 'Your Gokaasa booking details.' });

  useEffect(() => {
    let active = true;
    bookingApi
      .booking(bookingId)
      .then((result) => {
        if (!active) return;
        setBooking(result);
        if (result.status === 'CONFIRMED') clearSelection();
      })
      .catch((err) => active && setError(normalizeError(err).message));
    return () => {
      active = false;
    };
  }, [bookingId]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState title="We couldn't find this booking" description={error} action={<Link to="/my-trips"><Button>Go to My Trips</Button></Link>} />
      </div>
    );
  }
  if (!booking) return <FullPageSpinner label="Loading your booking" />;

  const confirmed = booking.status === 'CONFIRMED';
  const status = BOOKING_STATUS_LABEL[booking.status] ?? BOOKING_STATUS_LABEL.PAYMENT_PENDING;
  const money = (minor) => formatMoneyMinor(minor, booking.amounts.currency);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <BookingProgress current={confirmed ? 5 : 4} />

      {confirmed ? (
        <div className="mb-6 rounded-[var(--radius-card)] border border-success-600/30 bg-success-50 p-6 text-center sm:p-8">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success-600" aria-hidden="true" />
          <h1 className="mt-3 text-2xl font-semibold text-[var(--text-strong)]">✓ Booking Confirmed</h1>
          <p className="mt-1 text-sm text-[var(--text-body)]">A confirmation has been sent to {booking.primaryContact.email}.</p>
          <p className="mt-4 text-sm text-[var(--text-muted)]">Booking ID</p>
          <p className="font-mono text-xl font-semibold tracking-wide text-[var(--text-strong)]" data-testid="booking-ref">
            {booking.bookingRef}
          </p>
        </div>
      ) : (
        <div className="mb-6 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6">
          <p className="text-sm text-[var(--text-muted)]">Booking reference</p>
          <p className="font-mono text-xl font-semibold text-[var(--text-strong)]">{booking.bookingRef}</p>
          <p className="mt-2 text-sm">
            Status: <span className="font-medium">{status.label}</span>
          </p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className="aspect-[16/9] bg-[var(--surface-muted)]">
            <SafeImage src={booking.hotel.imageUrl} alt={booking.hotel.name} className="h-full w-full object-cover" />
          </div>
          <div className="space-y-3 p-5">
            <h2 className="text-lg font-semibold text-[var(--text-strong)]">{booking.hotel.name}</h2>
            <p className="text-sm text-[var(--text-muted)]">{booking.hotel.address}</p>
            <p className="text-sm font-medium text-[var(--text-strong)]">
              {booking.rooms.map((room) => `${room.quantity} × ${room.name}`).join(', ')} · {booking.rooms[0]?.ratePlanName}
            </p>
            <p className="text-sm text-[var(--text-body)]">
              {formatStayDate(booking.stay.checkIn)} → {formatStayDate(booking.stay.checkOut)} · {booking.stay.nights} night{booking.stay.nights === 1 ? '' : 's'}
            </p>
            <p className="text-sm text-[var(--text-body)]">{occupancyLabel(booking.guests.length ? roomsFromGuests(booking) : [])}</p>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <dl className="space-y-2 text-sm">
            <Row label="Amount paid" value={money(booking.amounts.paid)} strong />
            <Row label="Payment ID" value={booking.payment?.id ?? '—'} mono />
            <Row label="Payment status" value={booking.paymentStatus} />
          </dl>
          <div className="space-y-1 border-t border-[var(--border-subtle)] pt-4 text-sm">
            <p className="font-medium text-[var(--text-strong)]">Cancellation policy</p>
            <p className="text-[var(--text-body)]">{booking.cancellation.description}</p>
          </div>
          <div className="space-y-1 border-t border-[var(--border-subtle)] pt-4 text-sm">
            <p className="font-medium text-[var(--text-strong)]">Guests</p>
            <ul className="text-[var(--text-body)]">
              {booking.guests.map((guest) => (
                <li key={`${guest.roomIndex}-${guest.name}`}>
                  {guest.name} · {guest.age} · Room {guest.roomIndex + 1}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      {confirmed && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Link to={`/my-trips/${booking.id}`}>
            <Button variant="secondary" className="w-full sm:w-auto">View Booking</Button>
          </Link>
          <Button variant="secondary" onClick={() => downloadInvoice(booking)} className="w-full sm:w-auto">
            <Download className="h-4 w-4" aria-hidden="true" /> Download Invoice
          </Button>
          <Link to="/my-trips">
            <Button className="w-full sm:w-auto">
              <Luggage className="h-4 w-4" aria-hidden="true" /> Go to My Trips
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

/** Room groupings for the occupancy label, rebuilt from the stored guest list. */
function roomsFromGuests(booking) {
  const rooms = new Map();
  for (const guest of booking.guests) {
    const room = rooms.get(guest.roomIndex) ?? { adults: 0, childAges: [] };
    if (guest.age < 18) room.childAges.push(guest.age);
    else room.adults += 1;
    rooms.set(guest.roomIndex, room);
  }
  return [...rooms.values()];
}

function Row({ label, value, strong, mono }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className={`${strong ? 'font-semibold text-[var(--text-strong)]' : 'text-[var(--text-body)]'} ${mono ? 'font-mono text-xs' : ''} text-right break-all`}>{value}</dd>
    </div>
  );
}
