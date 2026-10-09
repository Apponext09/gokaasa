import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarDays, Download, Luggage } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Tabs } from '@/components/ui/tabs.jsx';
import { Badge, Card } from '@/components/ui/surfaces.jsx';
import { EmptyState, PageHeader } from '@/components/shared/index.jsx';
import { SafeImage } from '@/components/shared/SafeImage.jsx';
import { CancelBookingDialog } from '@/features/booking/components/CancelBookingDialog.jsx';
import { ReviewCta } from '@/features/reviews/ReviewCta.jsx';
import { downloadInvoice } from '@/features/booking/invoice.js';
import { BOOKING_STATUS_LABEL, formatMoneyMinor, formatStayDate, rebookPath } from '@/features/booking/bookingFormat.js';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';
import { normalizeError } from '@/services/api.js';
import { bookingApi } from '@/services/endpoints.js';

const INVOICEABLE_STATUSES = ['CONFIRMED', 'REFUND_PENDING', 'REFUNDED'];

const TABS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const EMPTY = {
  upcoming: 'No upcoming trips yet. When you book a stay it will appear here.',
  completed: 'Completed stays will appear here.',
  cancelled: 'Cancelled bookings and their refunds will appear here.',
};

/** My Trips: every booking the signed-in guest owns, in three tabs. The list is read from the server each time. */
export function MyTripsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'upcoming';
  const [state, setState] = useState({ items: [], loading: true, error: null });
  const [cancelling, setCancelling] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useDocumentMeta({ title: 'My trips | Gokaasa', description: 'Your upcoming, completed and cancelled Gokaasa bookings.' });

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    bookingApi
      .myTrips(tab)
      .then((result) => active && setState({ items: result.items, loading: false, error: null }))
      .catch((err) => active && setState({ items: [], loading: false, error: normalizeError(err).message }));
    return () => {
      active = false;
    };
  }, [tab, reloadKey]);

  const refresh = () => setReloadKey((key) => key + 1);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader title="My trips" description="Bookings you have made on Gokaasa." />
      <Tabs label="Trips" value={tab} items={TABS} onChange={(value) => setParams({ tab: value })} />

      {state.loading && <p className="text-sm text-[var(--text-muted)]">Loading your trips…</p>}
      {state.error && <p role="alert" className="text-sm text-danger-600">{state.error}</p>}

      {!state.loading && !state.error && state.items.length === 0 && (
        <EmptyState icon={Luggage} title="Nothing here yet" description={EMPTY[tab]} action={<Link to="/"><Button>Find a stay</Button></Link>} />
      )}

      <ul className="space-y-4">
        {state.items.map((trip) => {
          const status = BOOKING_STATUS_LABEL[trip.status] ?? BOOKING_STATUS_LABEL.PAYMENT_PENDING;
          return (
            <li key={trip.id}>
              <Card className="flex flex-col gap-4 p-4 sm:flex-row">
                <div className="aspect-[16/10] w-full shrink-0 overflow-hidden rounded-[var(--radius-control)] bg-[var(--surface-muted)] sm:w-44">
                  <SafeImage src={trip.hotel.imageUrl} alt={trip.hotel.name} className="h-full w-full object-cover" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <span className="font-mono text-xs text-[var(--text-muted)]">{trip.bookingRef}</span>
                  </div>
                  <h2 className="truncate text-base font-semibold text-[var(--text-strong)]">{trip.hotel.name}</h2>
                  <p className="text-sm text-[var(--text-muted)]">
                    {trip.hotel.city} · {trip.roomName}
                  </p>
                  <p className="flex items-center gap-1.5 text-sm text-[var(--text-body)]">
                    <CalendarDays className="h-4 w-4" aria-hidden="true" />
                    {formatStayDate(trip.checkIn, { day: 'numeric', month: 'short', year: 'numeric' })} → {formatStayDate(trip.checkOut, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
                    <span className="text-sm font-semibold text-[var(--text-strong)]">{formatMoneyMinor(trip.totalMinor, trip.currency)}</span>
                    <div className="flex flex-wrap gap-2">
                      <Link to={`/my-trips/${trip.id}`}>
                        <Button variant="secondary" size="sm">View Details</Button>
                      </Link>
                      {tab === 'upcoming' && trip.status === 'CONFIRMED' && (
                        <Button variant="danger-outline" size="sm" onClick={() => setCancelling(trip.id)}>
                          Cancel Booking
                        </Button>
                      )}
                      {INVOICEABLE_STATUSES.includes(trip.status) && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => downloadInvoice(trip).catch((err) => toast.error(normalizeError(err).message))}
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" /> Invoice
                        </Button>
                      )}
                      {tab === 'completed' && (
                        <ReviewCta
                          bookingId={trip.id}
                          review={trip.review}
                          onChanged={(review) =>
                            setState((s) => ({ ...s, items: s.items.map((item) => (item.id === trip.id ? { ...item, review } : item)) }))
                          }
                        />
                      )}
                      {(tab === 'completed' || tab === 'cancelled') && (
                        <Link to={rebookPath(trip)}>
                          <Button variant="secondary" size="sm">Book Again</Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      <CancelBookingDialog
        bookingId={cancelling}
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        onCancelled={refresh}
      />
    </div>
  );
}
