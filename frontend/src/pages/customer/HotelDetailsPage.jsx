import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Building2, Calendar, ExternalLink, MapPin, RefreshCw, Share2, Star, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Badge, Skeleton } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { EmptyState, formatDateTime } from '@/components/shared/index.jsx';
import { DateRangePicker } from '@/features/search/components/DateRangePicker.jsx';
import { GuestsPopover } from '@/features/search/components/GuestsPopover.jsx';
import { HotelCard } from '@/features/search/components/HotelCard.jsx';
import { PublicGallery } from '@/features/hotels/components/PublicGallery.jsx';
import { AmenityGroups } from '@/features/hotels/components/AmenityGroups.jsx';
import { RoomCard, UnavailableRooms } from '@/features/rooms/components/RoomOffers.jsx';
import { SelectionBar } from '@/features/booking/SelectionBar.jsx';
import { clearSelection, readSelection, saveSelection } from '@/features/booking/selection.js';
import { WishlistButton } from '@/components/shared/WishlistButton.jsx';
import { HotelReviewsSection } from '@/features/reviews/HotelReviewsSection.jsx';
import {
  formatOccupancy,
  nightsBetween,
  parseSearchParams,
  slugifyPlace,
  stayParams,
  summarizeOccupancy,
  todayIso,
  validateStay,
} from '@/features/search/searchParams.js';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { discoveryApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const titleCase = (slug) => slug.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Adds Hotel structured data for search engines. Only fields that exist are included. */
function useHotelJsonLd(hotel) {
  useEffect(() => {
    if (!hotel) return undefined;
    const data = {
      '@context': 'https://schema.org',
      '@type': 'Hotel',
      name: hotel.name,
      description: hotel.description ?? undefined,
      image: hotel.images?.map((i) => i.url).filter(Boolean).slice(0, 5),
      address: {
        '@type': 'PostalAddress',
        streetAddress: hotel.addressLine ?? undefined,
        addressLocality: hotel.city,
        addressRegion: hotel.state ?? undefined,
        postalCode: hotel.postalCode ?? undefined,
        addressCountry: hotel.countryCode,
      },
      ...(hotel.latitude != null ? { geo: { '@type': 'GeoCoordinates', latitude: hotel.latitude, longitude: hotel.longitude } } : {}),
      ...(hotel.starRating ? { starRating: { '@type': 'Rating', ratingValue: hotel.starRating } } : {}),
      ...(hotel.guestRating != null && hotel.reviewCount > 0
        ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: hotel.guestRating, reviewCount: hotel.reviewCount } }
        : {}),
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.gokaasa = 'hotel';
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
    return () => script.remove();
  }, [hotel]);
}

export function HotelDetailsPage() {
  const { citySlug, hotelSlug } = useParams();
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => parseSearchParams(params), [params]);
  const today = todayIso();
  const stayProblem = validateStay(state, today);
  const hasStay = !stayProblem;
  const nights = hasStay ? nightsBetween(state.checkIn, state.checkOut) : 0;

  const { status: authStatus } = useAuth();
  const [hotel, setHotel] = useState(null);
  const [hotelState, setHotelState] = useState('loading');
  const [availability, setAvailability] = useState(null);
  const [availabilityState, setAvailabilityState] = useState('idle');
  const [availabilityError, setAvailabilityError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState(false);
  const [selection, setSelection] = useState(() => readSelection());

  // Rooms can be quoted for a different number of rooms than the search. The quote still comes from the server.
  const [quantity, setQuantity] = useState(state.occupancy.length);
  useEffect(() => {
    setQuantity(state.occupancy.length);
  }, [state.occupancy.length]);
  const effectiveOccupancy = quantity === state.occupancy.length ? state.occupancy : Array.from({ length: quantity }, () => state.occupancy[0]);

  useEffect(() => {
    // Wait for the session check so a signed-in customer's wishlist state is included in the response.
    if (authStatus === 'loading') return undefined;
    const controller = new AbortController();
    setHotelState('loading');
    discoveryApi
      .hotel(hotelSlug, { signal: controller.signal })
      .then((data) => {
        setHotel(data);
        setHotelState('ready');
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setHotelState(normalizeError(err).status === 404 ? 'missing' : 'error');
      });
    return () => controller.abort();
  }, [hotelSlug, retry, authStatus]);

  const occupancyKey = formatOccupancy(effectiveOccupancy);
  useEffect(() => {
    if (!hasStay || hotelState !== 'ready') {
      setAvailability(null);
      setAvailabilityState('idle');
      return undefined;
    }
    const controller = new AbortController();
    setAvailabilityState('loading');
    setAvailabilityError(null);
    discoveryApi
      .availability(hotelSlug, { checkIn: state.checkIn, checkOut: state.checkOut, occ: occupancyKey }, { signal: controller.signal })
      .then((data) => {
        setAvailability(data);
        setAvailabilityState('ready');
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setAvailabilityError(normalizeError(err).message);
        setAvailabilityState('error');
      });
    return () => controller.abort();
    // The request depends only on these inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelSlug, state.checkIn, state.checkOut, occupancyKey, hasStay, hotelState, retry]);

  useHotelJsonLd(hotel);

  const cityLabel = hotel?.city ?? titleCase(citySlug ?? '');
  const heroImage = hotel?.images?.[0]?.url;
  useDocumentMeta({
    title: hotel ? `${hotel.name} ${hotel.city} — Rooms & Prices | Gokaasa` : 'Hotel | Gokaasa',
    description: hotel
      ? (hotel.description ? hotel.description.slice(0, 155) : `${hotel.name} in ${hotel.city}: rooms, rates and cancellation policies.`)
      : undefined,
    canonicalPath: hotel ? `/hotels/${slugifyPlace(hotel.city)}/${hotel.slug}` : undefined,
    image: heroImage,
  });

  const updateStay = (patch) => {
    setParams(stayParams({ ...state, ...patch }));
  };

  const rooms = availability?.roomTypes ?? [];
  const bookable = rooms.filter((room) => room.available);
  const unavailable = rooms.filter((room) => !room.available);

  const choose = (room, plan) => {
    const next = {
      hotelId: hotel.id,
      hotelSlug: hotel.slug,
      citySlug: slugifyPlace(hotel.city),
      roomTypeId: room.id,
      roomName: room.name,
      ratePlanId: plan.ratePlanId,
      ratePlanName: plan.name,
      mealPlan: plan.mealPlan,
      refundable: plan.refundable,
      checkIn: state.checkIn,
      checkOut: state.checkOut,
      nights,
      rooms: quantity,
      occupancy: effectiveOccupancy.map((r) => ({ adults: r.adults, childAges: r.childAges })),
      pricePerNightMinor: plan.pricePerNight,
      subtotalMinor: plan.subtotal,
      discountMinor: plan.discount,
      taxesMinor: plan.taxes,
      feesMinor: plan.fees,
      finalAmountMinor: plan.finalAmount,
      currency: plan.currency ?? 'INR',
      quotedAt: new Date().toISOString(),
    };
    saveSelection(next);
    setSelection(next);
    toast.success(`${room.name} selected`);
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: hotel.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
      }
    } catch {
      // Cancelled by the user or not permitted: nothing to report.
    }
  };

  if (hotelState === 'loading') {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-9 w-96" />
        <Skeleton className="h-[26rem] w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (hotelState === 'missing') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState
          icon={Building2}
          title="We couldn't find this hotel"
          description="The link may be out of date, or the hotel is no longer listed on Gokaasa."
          action={<Link to={`/hotels/${citySlug}`} className="text-sm font-medium text-brand-600 hover:underline">Back to {cityLabel} hotels</Link>}
        />
      </div>
    );
  }

  if (hotelState === 'error') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <Alert tone="error" title="We couldn't load this hotel right now.">
          <span className="flex flex-wrap items-center gap-3">
            Please try again in a moment.
            <Button size="sm" variant="secondary" onClick={() => setRetry((r) => r + 1)}>Try again</Button>
          </span>
        </Alert>
      </div>
    );
  }

  const policies = hotel.cancellationPolicies ?? [];
  const location = [hotel.addressLine, hotel.area, hotel.city, hotel.state, hotel.countryCode].filter(Boolean).join(', ');
  const mapsUrl = hotel.latitude != null ? `https://www.google.com/maps/search/?api=1&query=${hotel.latitude},${hotel.longitude}` : null;
  const backToResults = `/hotels/${slugifyPlace(hotel.city)}${hasStay ? `?${stayParams(state)}` : ''}`;

  return (
    <div className="pb-28">
      <div className="mx-auto max-w-7xl space-y-10 px-4 py-6 sm:px-6 lg:py-8">
        {/* 1. Breadcrumb */}
        <nav aria-label="Breadcrumb" className="text-sm text-[var(--text-muted)]">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link to="/" className="hover:text-[var(--text-strong)]">Home</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link to={backToResults} className="hover:text-[var(--text-strong)]">Hotels in {cityLabel}</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="truncate text-[var(--text-body)]">{hotel.name}</li>
          </ol>
        </nav>

        {/* 2-7. Name, location, rating, reviews, wishlist, share */}
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              {hotel.starRating && (
                <span className="flex items-center gap-0.5" aria-label={`${hotel.starRating} star hotel`}>
                  {Array.from({ length: hotel.starRating }, (_, i) => <Star key={i} className="h-3.5 w-3.5 fill-accent-500 text-accent-500" aria-hidden="true" />)}
                </span>
              )}
              <Badge tone="neutral">{hotel.propertyType.replace('_', ' ').toLowerCase()}</Badge>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-strong)] sm:text-4xl">{hotel.name}</h1>
            <p className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" /> {location}
            </p>
            {(hotel.guestRating != null || hotel.rating) && (
              <p className="flex items-center gap-2 text-sm">
                <span className="grid h-7 min-w-7 place-items-center rounded-md bg-brand-600 px-1.5 font-semibold text-white">
                  {(hotel.guestRating ?? hotel.rating.average).toFixed(1)}
                </span>
                <a href="#reviews" className="text-[var(--text-body)] hover:underline">
                  {hotel.guestRating != null
                    ? (hotel.reviewCount > 0 ? `${hotel.reviewCount.toLocaleString('en-IN')} guest reviews` : 'Guest rating')
                    : `${hotel.rating.count.toLocaleString('en-IN')} Gokaasa review${hotel.rating.count === 1 ? '' : 's'}`}
                </a>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <WishlistButton hotelId={hotel.id} initial={hotel.isWishlisted} hotelName={hotel.name} variant="button" />
            <Button variant="secondary" onClick={share}>
              <Share2 className="h-4 w-4" aria-hidden="true" /> Share
            </Button>
          </div>
        </header>

        {/* 8. Gallery */}
        <PublicGallery images={hotel.images ?? []} name={hotel.name} />

        {/* 9. Overview */}
        <section id="overview" aria-labelledby="overview-heading" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-3">
            <h2 id="overview-heading" className="text-xl font-semibold text-[var(--text-strong)]">About this hotel</h2>
            {hotel.description ? (
              <p className="whitespace-pre-line text-[15px] leading-7 text-[var(--text-body)]">{hotel.description}</p>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">The hotel has not added a description yet.</p>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-4 self-start rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 text-sm lg:grid-cols-1">
            {hotel.checkInTime && (
              <div><dt className="text-[var(--text-muted)]">Check-in from</dt><dd className="font-medium text-[var(--text-strong)]">{hotel.checkInTime.slice(0, 5)}</dd></div>
            )}
            {hotel.checkOutTime && (
              <div><dt className="text-[var(--text-muted)]">Check-out by</dt><dd className="font-medium text-[var(--text-strong)]">{hotel.checkOutTime.slice(0, 5)}</dd></div>
            )}
            <div><dt className="text-[var(--text-muted)]">Property type</dt><dd className="font-medium capitalize text-[var(--text-strong)]">{hotel.propertyType.replace('_', ' ').toLowerCase()}</dd></div>
          </dl>
        </section>

        {/* 10. Amenities */}
        <section id="amenities" aria-labelledby="amenities-heading" className="space-y-4">
          <h2 id="amenities-heading" className="text-xl font-semibold text-[var(--text-strong)]">Amenities</h2>
          <AmenityGroups amenities={hotel.amenities ?? []} />
        </section>

        {/* 11. Available rooms, with dates and guests */}
        <section id="rooms" aria-labelledby="rooms-heading" className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="rooms-heading" className="text-xl font-semibold text-[var(--text-strong)]">Available rooms</h2>
              {hasStay ? (
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-[var(--text-muted)]">
                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> {shortDate(state.checkIn)} → {shortDate(state.checkOut)} · {nights} night{nights === 1 ? '' : 's'} · <Users className="h-3.5 w-3.5" aria-hidden="true" /> {summarizeOccupancy(effectiveOccupancy)}
                </p>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">Choose dates and guests to see rooms and prices.</p>
              )}
            </div>
            <Button variant="secondary" size="sm" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
              {hasStay ? 'Change dates or guests' : 'Choose dates'}
            </Button>
          </div>

          {(editing || !hasStay) && (
            <div className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 md:grid-cols-[1.4fr_1fr] md:items-start">
              <DateRangePicker
                idPrefix="details"
                min={today}
                checkIn={state.checkIn}
                checkOut={state.checkOut}
                onChange={({ checkIn, checkOut }) => {
                  if (checkIn && checkOut) updateStay({ checkIn, checkOut });
                  else if (checkIn) updateStay({ checkIn, checkOut: null });
                }}
              />
              <GuestsPopover idPrefix="details" rooms={state.occupancy} onChange={(occupancy) => updateStay({ occupancy })} />
              {stayProblem && <p className="md:col-span-2 text-sm text-danger-600">{stayProblem}</p>}
            </div>
          )}

          {hasStay && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-[var(--text-muted)]">Rooms to book</span>
              <div className="inline-flex items-center rounded-full border border-[var(--border-subtle)]">
                <button type="button" aria-label="Fewer rooms" disabled={quantity <= 1} onClick={() => setQuantity((q) => q - 1)} className="h-8 w-8 disabled:opacity-35">−</button>
                <span className="w-8 text-center font-semibold tabular-nums" aria-live="polite">{quantity}</span>
                <button type="button" aria-label="More rooms" disabled={quantity >= 8} onClick={() => setQuantity((q) => q + 1)} className="h-8 w-8 disabled:opacity-35">+</button>
              </div>
            </div>
          )}

          {hasStay && availabilityState === 'loading' && (
            <div className="space-y-4" aria-label="Checking room availability">
              <Skeleton className="h-64 w-full rounded-[var(--radius-card)]" />
              <Skeleton className="h-64 w-full rounded-[var(--radius-card)]" />
            </div>
          )}

          {hasStay && availabilityState === 'error' && (
            <Alert tone="error" title="We couldn't check rooms right now.">
              <span className="flex flex-wrap items-center gap-3">
                {availabilityError}
                <Button size="sm" variant="secondary" onClick={() => setRetry((r) => r + 1)}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
                </Button>
              </span>
            </Alert>
          )}

          {hasStay && availabilityState === 'ready' && bookable.length === 0 && (
            <Alert tone="warning" title="This hotel is no longer available for your selected dates.">
              Try different dates or fewer guests. The rooms below show why each one is unavailable.
            </Alert>
          )}

          {hasStay && availabilityState === 'ready' && bookable.length > 0 && (
            <ul className="space-y-5" aria-label="Rooms available for your dates">
              {bookable.map((room) => (
                <li key={room.id}>
                  <RoomCard room={room} nights={nights} rooms={quantity} selection={selection} onSelect={choose} />
                </li>
              ))}
            </ul>
          )}

          {hasStay && availabilityState === 'ready' && <UnavailableRooms rooms={unavailable} />}
        </section>

        {/* 12. Policies */}
        <section id="policies" aria-labelledby="policies-heading" className="space-y-4">
          <h2 id="policies-heading" className="text-xl font-semibold text-[var(--text-strong)]">Cancellation policies</h2>
          {policies.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Each rate states its cancellation terms when you choose it.</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {policies.map((policy) => (
                <li key={policy.code} className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
                  <p className="font-medium text-[var(--text-strong)]">{policy.name}</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">{policy.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 13. Location */}
        <section id="location" aria-labelledby="location-heading" className="space-y-3">
          <h2 id="location-heading" className="text-xl font-semibold text-[var(--text-strong)]">Location</h2>
          <p className="text-[15px] text-[var(--text-body)]">{location}</p>
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
              Open in Google Maps <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </section>

        {/* 14. Reviews */}
        <HotelReviewsSection hotelRef={hotel.slug} rating={hotel.rating} />

        {/* 16. Similar hotels */}
        {hotel.similarHotels?.length > 0 && (
          <section id="similar" aria-labelledby="similar-heading" className="space-y-4">
            <h2 id="similar-heading" className="text-xl font-semibold text-[var(--text-strong)]">Other hotels in {hotel.city}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {hotel.similarHotels.map((similar) => (
                <HotelCard key={similar.id} hotel={similar} state={hasStay ? state : null} />
              ))}
            </div>
          </section>
        )}

        <p className="text-xs text-[var(--text-muted)]">Last updated {formatDateTime(hotel.updatedAt)}.</p>
      </div>

      {selection && selection.hotelId === hotel.id && (
        <SelectionBar
          selection={selection}
          onClear={() => {
            clearSelection();
            setSelection(null);
          }}
        />
      )}
    </div>
  );
}
