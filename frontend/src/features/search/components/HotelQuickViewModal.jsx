import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BedDouble, CalendarDays, CheckCircle2, Clock3, ExternalLink, MapPin, ShieldCheck, Sparkles, Star, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert, Skeleton } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { PublicGallery } from '@/features/hotels/components/PublicGallery.jsx';
import { AmenityGroups } from '@/features/hotels/components/AmenityGroups.jsx';
import { RoomCard, UnavailableRooms } from '@/features/rooms/components/RoomOffers.jsx';
import { formatOccupancy, nightsBetween } from '@/features/search/searchParams.js';
import { discoveryApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { cn } from '@/lib/utils.js';
import { formatHotelLocation } from '@/features/hotels/hotelLocation.js';

const TABS = [
  { value: 'overview', label: 'Overview & Photos' },
  { value: 'rooms', label: 'Select Rooms & Rates' },
  { value: 'amenities', label: 'Amenities' },
  { value: 'policies', label: 'Hotel Policies' },
];

const shortDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

export function HotelQuickViewModal({
  open,
  hotel,
  initialDetails,
  state,
  fullPath,
  onClose,
  onReserve,
  reserving = false,
}) {
  const [tab, setTab] = useState('overview');
  const [details, setDetails] = useState(initialDetails ?? null);
  const [detailsState, setDetailsState] = useState(initialDetails ? 'ready' : 'idle');
  const [detailsError, setDetailsError] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [availabilityState, setAvailabilityState] = useState('idle');
  const [availabilityError, setAvailabilityError] = useState(null);

  const stayReady = Boolean(state?.checkIn && state?.checkOut && state?.occupancy?.length);
  const nights = stayReady ? nightsBetween(state.checkIn, state.checkOut) : 0;

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setTab('overview');
    if (initialDetails) {
      setDetails(initialDetails);
      setDetailsState('ready');
    }
  }, [open, initialDetails]);

  useEffect(() => {
    if (!open || details?.slug === hotel.slug) return undefined;
    const controller = new AbortController();
    setDetailsState('loading');
    setDetailsError(null);
    discoveryApi
      .hotel(hotel.slug, { signal: controller.signal })
      .then((result) => {
        setDetails(result);
        setDetailsState('ready');
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setDetailsError(normalizeError(error).message);
        setDetailsState('error');
      });
    return () => controller.abort();
  }, [open, hotel.slug, details?.slug]);

  useEffect(() => {
    if (!open || !stayReady) {
      setAvailability(null);
      setAvailabilityState('idle');
      return undefined;
    }
    const controller = new AbortController();
    setAvailabilityState('loading');
    setAvailabilityError(null);
    discoveryApi
      .availability(
        hotel.slug,
        {
          checkIn: state.checkIn,
          checkOut: state.checkOut,
          occ: formatOccupancy(state.occupancy),
        },
        { signal: controller.signal },
      )
      .then((result) => {
        setAvailability(result);
        setAvailabilityState('ready');
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setAvailabilityError(normalizeError(error).message);
        setAvailabilityState('error');
      });
    return () => controller.abort();
  }, [open, hotel.slug, stayReady, state?.checkIn, state?.checkOut, state?.occupancy]);

  const roomTypes = availability?.roomTypes ?? [];
  const availableRooms = useMemo(() => roomTypes.filter((room) => room.available), [roomTypes]);
  const unavailableRooms = useMemo(() => roomTypes.filter((room) => !room.available), [roomTypes]);

  if (!open) return null;

  const currentHotel = details ?? hotel;
  const location = formatHotelLocation(currentHotel);
  const guestRating = currentHotel.guestRating ?? currentHotel.rating?.average ?? null;
  const reviewCount = currentHotel.guestRating != null
    ? currentHotel.reviewCount
    : currentHotel.rating?.count;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5">
      <button
        type="button"
        aria-label="Close hotel details"
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px]"
        onClick={onClose}
        tabIndex={-1}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="hotel-quick-view-title"
        className="customer-hotel-quick-view relative flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-[var(--surface-card)] shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="hotel-quick-view-title" className="text-lg font-bold tracking-tight text-[var(--text-strong)] sm:text-xl">
                {currentHotel.name}
              </h2>
              {currentHotel.starRating > 0 && (
                <span className="flex items-center gap-0.5" aria-label={`${currentHotel.starRating} star hotel`}>
                  {Array.from({ length: currentHotel.starRating }, (_, index) => (
                    <Star key={index} className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                  ))}
                </span>
              )}
            </div>
            <p className="mt-1 flex items-start gap-1.5 text-sm text-[var(--text-muted)]">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
              <span>{location || currentHotel.city}</span>
            </p>
            {guestRating != null && (
              <p className="mt-2 flex items-center gap-2 text-sm text-[var(--text-body)]">
                <span className="grid h-7 min-w-7 place-items-center rounded-md bg-brand-600 px-1.5 font-semibold text-white">
                  {Number(guestRating).toFixed(1)}
                </span>
                <span>
                  {reviewCount > 0
                    ? `${Number(reviewCount).toLocaleString('en-IN')} guest review${Number(reviewCount) === 1 ? '' : 's'}`
                    : 'Guest rating'}
                </span>
              </p>
            )}
          </div>
          <Button variant="secondary" size="icon" className="shrink-0 rounded-full" aria-label="Close" onClick={onClose}>
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </header>

        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--border-subtle)] bg-slate-50 px-4 sm:px-6" aria-label="Hotel details sections">
          {TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              aria-current={tab === item.value ? 'page' : undefined}
              className={cn(
                'relative shrink-0 px-4 py-3 text-sm font-semibold transition-colors',
                tab === item.value ? 'text-brand-700' : 'text-[var(--text-muted)] hover:text-[var(--text-strong)]',
              )}
            >
              {item.label}
              {tab === item.value && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand-600" />}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {detailsState === 'loading' && tab !== 'rooms' && (
            <div className="space-y-4" aria-label="Loading hotel details">
              <Skeleton className="aspect-[16/7] w-full rounded-xl" />
              <div className="grid gap-3 sm:grid-cols-3">
                <Skeleton className="h-20 rounded-xl" />
                <Skeleton className="h-20 rounded-xl" />
                <Skeleton className="h-20 rounded-xl" />
              </div>
            </div>
          )}

          {detailsState === 'error' && tab !== 'rooms' && (
            <Alert tone="error" title="We couldn't load the hotel details.">{detailsError}</Alert>
          )}

          {tab === 'overview' && detailsState === 'ready' && (
            <div className="space-y-6">
              <PublicGallery images={details?.images ?? []} name={currentHotel.name} />

              <div className="grid gap-3 md:grid-cols-3">
                <div className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-slate-50 p-4">
                  <ShieldCheck className="h-6 w-6 shrink-0 text-emerald-600" aria-hidden="true" />
                  <div><p className="font-semibold text-[var(--text-strong)]">Verified booking</p><p className="text-xs text-[var(--text-muted)]">Live prices and room inventory</p></div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-slate-50 p-4">
                  <Sparkles className="h-6 w-6 shrink-0 text-brand-600" aria-hidden="true" />
                  <div><p className="font-semibold text-[var(--text-strong)]">Guest-friendly stay</p><p className="text-xs text-[var(--text-muted)]">Amenities listed by the property</p></div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-slate-50 p-4">
                  <Clock3 className="h-6 w-6 shrink-0 text-sky-600" aria-hidden="true" />
                  <div><p className="font-semibold text-[var(--text-strong)]">Check-in {details.checkInTime ?? 'as listed'}</p><p className="text-xs text-[var(--text-muted)]">Check-out {details.checkOutTime ?? 'as listed'}</p></div>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-5">
                <h3 className="text-lg font-semibold text-[var(--text-strong)]">About this property</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-body)]">
                  {details.description || 'Property details will be provided before you complete your booking.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-100 bg-brand-50 p-4">
                <div>
                  <p className="font-semibold text-[var(--text-strong)]">Ready to compare rooms?</p>
                  <p className="text-sm text-[var(--text-muted)]">See real availability, cancellation terms, and total prices.</p>
                </div>
                <Button onClick={() => setTab('rooms')}>
                  <BedDouble className="h-4 w-4" aria-hidden="true" /> View Rooms & Deals
                </Button>
              </div>
            </div>
          )}

          {tab === 'rooms' && (
            <div className="space-y-5">
              {stayReady && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[var(--border-subtle)] bg-slate-50 px-4 py-3 text-sm">
                  <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-brand-600" /> {shortDate(state.checkIn)} → {shortDate(state.checkOut)}</span>
                  <span>{nights} night{nights === 1 ? '' : 's'}</span>
                  <span>{state.occupancy.length} room{state.occupancy.length === 1 ? '' : 's'}</span>
                </div>
              )}

              {!stayReady && <Alert tone="warning" title="Choose dates first">Select check-in, check-out, and guests to see live room deals.</Alert>}
              {availabilityState === 'loading' && (
                <div className="space-y-4" aria-label="Checking room availability">
                  <Skeleton className="h-64 rounded-xl" />
                  <Skeleton className="h-64 rounded-xl" />
                </div>
              )}
              {availabilityState === 'error' && <Alert tone="error" title="Rooms couldn't be loaded.">{availabilityError}</Alert>}
              {availabilityState === 'ready' && availableRooms.length === 0 && (
                <Alert tone="warning" title="No rooms available">Try different dates or fewer guests.</Alert>
              )}
              {availabilityState === 'ready' && availableRooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  nights={nights}
                  rooms={state.occupancy.length}
                  selection={null}
                  disabled={reserving}
                  onSelect={(selectedRoom, plan) => onReserve(selectedRoom, plan)}
                />
              ))}
              {availabilityState === 'ready' && <UnavailableRooms rooms={unavailableRooms} />}
            </div>
          )}

          {tab === 'amenities' && detailsState === 'ready' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold text-[var(--text-strong)]">Property amenities</h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Facilities currently listed for this property.</p>
              </div>
              <AmenityGroups amenities={details?.amenities ?? []} />
            </div>
          )}

          {tab === 'policies' && detailsState === 'ready' && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-[var(--border-subtle)] p-5">
                <Clock3 className="h-5 w-5 text-brand-600" aria-hidden="true" />
                <h3 className="mt-3 font-semibold text-[var(--text-strong)]">Check-in and check-out</h3>
                <p className="mt-2 text-sm text-[var(--text-muted)]">Check-in: {details.checkInTime ?? 'Confirm with property'}</p>
                <p className="text-sm text-[var(--text-muted)]">Check-out: {details.checkOutTime ?? 'Confirm with property'}</p>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] p-5">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                <h3 className="mt-3 font-semibold text-[var(--text-strong)]">Cancellation and payment</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Exact cancellation and refund terms are shown beside every room rate before reservation.</p>
              </div>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-white px-5 py-3 sm:px-7">
          <p className="text-xs text-[var(--text-muted)]">Prices and availability are verified again before your room is held.</p>
          <Link to={fullPath} onClick={onClose}>
            <Button variant="secondary" size="sm">
              Full hotel page <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </Link>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
