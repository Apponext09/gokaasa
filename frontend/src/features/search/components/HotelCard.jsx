import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Clock3, MapPin, ShieldCheck, Sparkles, Star, Tag, Undo2, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Skeleton } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { SafeImage } from '@/components/shared/SafeImage.jsx';
import { WishlistButton } from '@/components/shared/WishlistButton.jsx';
import { formatMoney } from '@/components/shared/index.jsx';
import { GuestContactModal } from '@/features/booking/GuestContactModal.jsx';
import { saveSelection } from '@/features/booking/selection.js';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { stayParams, slugifyPlace } from '@/features/search/searchParams.js';
import { discountDisplay } from '@/features/search/discountDisplay.js';
import { isIllustrativeCover } from '@/features/hotels/imageDisclaimer.js';
import { formatHotelLocation } from '@/features/hotels/hotelLocation.js';
import { bookingApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { cn } from '@/lib/utils.js';

const MEAL_LABEL = { ROOM_ONLY: 'Room only', BREAKFAST: 'Breakfast included', HALF_BOARD: 'Half board', FULL_BOARD: 'Full board' };
const mealLabel = (code) => MEAL_LABEL[code] ?? String(code ?? 'Room rate').replaceAll('_', ' ').toLowerCase();
const PROPERTY_LABEL = { HOTEL: 'Hotel', RESORT: 'Resort', VILLA: 'Villa', APARTMENT: 'Apartment', HOSTEL: 'Hostel', GUEST_HOUSE: 'Guest house' };
const UNAVAILABLE_COPY = {
  SOLD_OUT: ['Sold out for these dates', 'Try different dates or view the hotel for other room options.'],
  NO_ACTIVE_ROOM: ['Rooms currently unavailable', 'This hotel is visible, but it is not accepting room bookings right now.'],
  NO_ACTIVE_RATE: ['Rates currently unavailable', 'This hotel has no active bookable rate right now.'],
  OCCUPANCY_NOT_SUPPORTED: ['No room fits these guests', 'Try fewer guests, more rooms, or different occupancy.'],
  UNAVAILABLE: ['Currently unavailable', 'Try different dates or view the hotel for more information.'],
};

/** Public hotel page path. Uses the city slug the rest of the site uses, plus the search stay if there is one. */
export function hotelPath(hotel, state) {
  const params = state ? stayParams(state) : new URLSearchParams();
  const query = params.toString();
  return `/hotels/${slugifyPlace(hotel.city)}/${hotel.slug}${query ? `?${query}` : ''}`;
}

/**
 * `compact` renders a single-column card sized for the narrow booking-assistant chat panel, instead of the
 * default two/three-column page layout whose `md:`/`lg:` classes are viewport-width-based and would apply
 * their desktop layout even while the card sits inside the chat panel's much narrower box. It also drops
 * the "View Rooms & Deals" / "Quick Reserve" actions (page navigation and an immediate hold, both of which
 * bypass the chat's own room-selection step) in favor of a compact price summary -- hotel selection inside
 * the chat is handled by the "Select this stay" action the assistant renders next to each card.
 */
export function HotelCard({ hotel, state, compact = false }) {
  const navigate = useNavigate();
  const { status: authStatus } = useAuth();
  const offer = hotel.bestOffer;
  const couponOffer = hotel.offer;
  const place = formatHotelLocation(hotel, { compact: true });
  const offerPricing = discountDisplay(offer);
  const pricePerNightMinor = offer ? offerPricing.pricePerNightMinor : hotel.price?.amountMinor;
  const originalPerNightMinor = offer ? offerPricing.originalPerNightMinor : hotel.price?.originalAmountMinor;
  const discountPercent = offer ? offerPricing.discountPercent : (hotel.price?.discountPercent ?? 0);
  const hasDisplayPrice = Number.isFinite(Number(pricePerNightMinor));
  const unavailable = hotel.available === false;
  const temporarilyHeld = hotel.availabilityStatus === 'TEMPORARILY_HELD';
  const unavailableCopy = UNAVAILABLE_COPY[hotel.availabilityStatus] ?? UNAVAILABLE_COPY.UNAVAILABLE;
  const allAmenities = useMemo(() => [...new Set(hotel.amenities ?? [])], [hotel.amenities]);
  const [showAllAmenities, setShowAllAmenities] = useState(false);
  const visibleAmenities = showAllAmenities ? allAmenities : allAmenities.slice(0, 3);
  const remainingAmenitiesCount = Math.max(0, allAmenities.length - 3);
  const fullPath = hotelPath(hotel, state);

  const [guestModalOpen, setGuestModalOpen] = useState(false);
  const [pendingSelection, setPendingSelection] = useState(null);
  const [reserving, setReserving] = useState(false);
  const [holdSecondsRemaining, setHoldSecondsRemaining] = useState(null);

  useEffect(() => {
    if (!temporarilyHeld || !hotel.retryAt) {
      setHoldSecondsRemaining(null);
      return undefined;
    }
    const update = () => setHoldSecondsRemaining(Math.max(0, Math.ceil((new Date(hotel.retryAt).getTime() - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [hotel.retryAt, temporarilyHeld]);

  const startHold = async (selection) => {
    if (!selection) return;
    setReserving(true);
    try {
      const totalPets = (selection.occupancy || []).reduce((sum, r) => sum + (r.pets || 0), 0) || selection.petsCount || 0;
      const hold = await bookingApi.createHold({
        hotelId: selection.hotelId,
        roomTypeId: selection.roomTypeId,
        ratePlanId: selection.ratePlanId,
        checkIn: selection.checkIn,
        checkOut: selection.checkOut,
        rooms: selection.rooms,
        occupancy: selection.occupancy,
        petsCount: totalPets,
        idempotencyKey: selection.idempotencyKey,
      });
      const nextParams = new URLSearchParams({ holdId: String(hold.id) });
      if (selection.coupon) nextParams.set('coupon', selection.coupon);
      navigate(`/booking/guest-details?${nextParams}`);
    } catch (error) {
      const normalized = normalizeError(error);
      toast.error(normalized.status === 409 ? `This room just became unavailable. ${normalized.message}` : normalized.message);
    } finally {
      setReserving(false);
    }
  };

  const beginReserve = (selection) => {
    const saved = saveSelection(selection);
    setPendingSelection(saved);
    if (authStatus !== 'authenticated') {
      setGuestModalOpen(true);
      return;
    }
    startHold(saved);
  };

  const quickReserve = () => {
    if (unavailable || !offer || !state?.checkIn || !state?.checkOut || !state?.occupancy?.length) return;
    beginReserve({
      hotelId: hotel.id,
      hotelSlug: hotel.slug,
      citySlug: slugifyPlace(hotel.city),
      roomTypeId: offer.roomTypeId,
      roomName: offer.roomName,
      ratePlanId: offer.ratePlanId,
      ratePlanName: offer.ratePlanName,
      mealPlan: offer.mealPlan,
      mealPlanName: offer.mealPlanName,
      refundable: offer.refundable,
      checkIn: state.checkIn,
      checkOut: state.checkOut,
      nights: offer.nights,
      rooms: state.occupancy.length,
      occupancy: state.occupancy.map((room) => ({ adults: room.adults, childAges: room.childAges, pets: room.pets || 0 })),
      petsCount: state.occupancy.reduce((sum, r) => sum + (r.pets || 0), 0) || state.pets || 0,
      pricePerNightMinor: offer.pricePerNightMinor,
      subtotalMinor: offer.baseTotalMinor,
      discountMinor: offer.discountTotalMinor,
      taxesMinor: offer.taxTotalMinor,
      feesMinor: offer.feeTotalMinor,
      finalAmountMinor: offer.finalTotalMinor,
      currency: 'INR',
      coupon: state.coupon,
      quotedAt: new Date().toISOString(),
    });
  };

  return (
    <>
      <article
        className={cn(
          'customer-hotel-card group flex flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] transition-all duration-500',
          compact ? 'w-full' : 'cursor-pointer hover:-translate-y-1.5 hover:border-brand-300 hover:shadow-xl md:flex-row',
        )}
        onClick={compact ? undefined : (event) => {
          if (event.defaultPrevented) return;
          navigate(fullPath);
        }}
      >
      <div className={cn('relative aspect-[4/3] w-full shrink-0 overflow-hidden', !compact && 'md:aspect-auto md:w-72 lg:w-80')}>
        <SafeImage
          src={hotel.image?.url}
          alt={hotel.image?.altText ?? hotel.name}
          className={cn(
            'absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-[1.035] motion-reduce:transition-none motion-reduce:group-hover:scale-100',
          )}
          sizes="(min-width: 1024px) 320px, (min-width: 768px) 288px, 100vw"
          fallbackLabel={`${hotel.name}: photos coming soon`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/0 to-transparent transition-colors duration-500 group-hover:from-slate-950/15" />
        {/* A fixed top-left slot, always the same badge, so the discount never competes for space with the other badges below. */}
        {discountPercent > 0 && (
          <div className="absolute left-3 top-3">
            <Badge tone="premium">{discountPercent}% OFF</Badge>
          </div>
        )}
        <div className="absolute right-3 top-3">
          <WishlistButton hotelId={hotel.id} initial={hotel.wishlisted} hotelName={hotel.name} variant="chip" />
        </div>
        {isIllustrativeCover(hotel.image) && (
          <p className="hcard-image-disclaimer absolute inset-x-0 bottom-0 bg-slate-950/55 px-2.5 py-1 text-center text-[11px] text-white/90">
            Illustrative image
          </p>
        )}
      </div>

      <div className={cn('flex min-w-0 flex-1 flex-col gap-3', compact ? 'p-3' : 'p-4 md:p-5')}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            {hotel.starRating ? (
              <div className="flex items-center gap-0.5" aria-label={`${hotel.starRating} star hotel`}>
                {Array.from({ length: hotel.starRating }, (_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-accent-500 text-accent-500" aria-hidden="true" />
                ))}
              </div>
            ) : (
              <span className="text-xs text-[var(--text-muted)]">{hotel.propertyTypeName ?? PROPERTY_LABEL[hotel.propertyType] ?? hotel.propertyType?.replaceAll('_', ' ').toLowerCase() ?? 'Stay'}</span>
            )}
            <h3 className={cn('truncate font-semibold tracking-tight text-[var(--text-strong)]', compact ? 'text-base' : 'text-lg')}>
              <Link to={fullPath} className="hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500">
                {hotel.name}
              </Link>
            </h3>
            <p className="hcard-location-row flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden="true" />
              <span className="truncate">{place}</span>
            </p>
            {hotel.locationUrl && hotel.distanceKm != null && (
              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-brand-700">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                {Number(hotel.distanceKm).toFixed(1)} km
                <span className="hotel-distance-full"> from your location</span>
                <span className="hotel-distance-compact hidden" aria-hidden="true"> away</span>
              </span>
            )}
            {hasDisplayPrice && (
              <div className="hcard-mobile-price hidden">
                <span>{formatMoney(pricePerNightMinor)}</span>
                <small>/ night</small>
              </div>
            )}
          </div>
          {/* The provider's guest rating, where there is one. Otherwise Gokaasa's own guest reviews fill the gap; with neither, "New" beats inventing a number. */}
          {hotel.guestRating != null || hotel.rating ? (
            <div className="flex shrink-0 items-center gap-2">
              <span className="grid h-8 min-w-8 place-items-center rounded-md bg-brand-600 px-1.5 text-sm font-semibold text-white">
                {(hotel.guestRating ?? hotel.rating.average).toFixed(1)}
              </span>
              {hotel.guestRating != null ? (
                hotel.reviewCount > 0 && <span className="text-xs text-[var(--text-muted)]">{hotel.reviewCount.toLocaleString('en-IN')} reviews</span>
              ) : (
                <span className="text-xs text-[var(--text-muted)]">{hotel.rating.count.toLocaleString('en-IN')} Gokaasa review{hotel.rating.count === 1 ? '' : 's'}</span>
              )}
            </div>
          ) : (
            <Badge tone="neutral" className="shrink-0">New</Badge>
          )}
        </div>

        {allAmenities.length > 0 && (
          <ul className={cn('flex flex-wrap items-center gap-y-1 text-[var(--text-body)]', compact ? 'gap-x-3 text-xs' : 'gap-x-4 text-sm')}>
            {visibleAmenities.map((name) => (
              <li key={name} className="flex items-center gap-1">
                <Check className="h-3.5 w-3.5 shrink-0 text-success-600" aria-hidden="true" /> {name}
              </li>
            ))}
            {!showAllAmenities && remainingAmenitiesCount > 0 && (
              <li>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowAllAmenities(true);
                  }}
                  className="cursor-pointer text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline"
                >
                  +{remainingAmenitiesCount} more
                </button>
              </li>
            )}
            {showAllAmenities && remainingAmenitiesCount > 0 && (
              <li>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowAllAmenities(false);
                  }}
                  className="cursor-pointer text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-strong)] hover:underline"
                >
                  Show less
                </button>
              </li>
            )}
          </ul>
        )}

        {unavailable && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950" role="status">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
            <div>
              <p className="font-semibold">{temporarilyHeld ? 'Temporarily unavailable' : unavailableCopy[0]}</p>
              <p className="text-xs text-amber-800">
                {temporarilyHeld
                  ? `Another guest is completing a booking${holdSecondsRemaining != null && holdSecondsRemaining > 0 ? ` · check again in ${Math.floor(holdSecondsRemaining / 60)}:${String(holdSecondsRemaining % 60).padStart(2, '0')}` : ' · checking availability again shortly'}.`
                  : unavailableCopy[1]}
              </p>
            </div>
          </div>
        )}

        {unavailable && !offer && (
          <div className="mt-auto pt-1">
            <Button variant="secondary" onClick={(event) => { event.stopPropagation(); navigate(fullPath); }}>View hotel</Button>
          </div>
        )}

        {offer && (
          <div className="space-y-1 border-t border-[var(--border-subtle)] pt-3">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="brand">
                <UtensilsCrossed className="h-3 w-3" aria-hidden="true" /> {offer.mealPlanName ?? mealLabel(offer.mealPlan)}
              </Badge>
              {offer.freeCancellation ? (
                <Badge tone="success">
                  <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Free cancellation
                </Badge>
              ) : offer.refundable ? (
                <Badge tone="neutral">Partly refundable</Badge>
              ) : (
                <Badge tone="danger">
                  <Undo2 className="h-3 w-3" aria-hidden="true" /> Non-refundable
                </Badge>
              )}
              {offer.roomsLeft > 0 && offer.roomsLeft <= 3 && <Badge tone="warning">Only {offer.roomsLeft} left</Badge>}
              {hotel.petsAllowed && (
                <Badge tone="success">🐾 Pet friendly</Badge>
              )}
              {couponOffer && (
                <Badge tone="premium">
                  <Tag className="h-3 w-3" aria-hidden="true" /> {couponOffer.discountPercent > 0
                    ? `${couponOffer.discountPercent}% OFF`
                    : couponOffer.discountMinor > 0
                      ? `${formatMoney(couponOffer.discountMinor)} OFF`
                      : 'Offer'} with code {couponOffer.code}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Compact price summary for the chat panel: no page-navigation or quick-reserve actions here --
            the assistant's own "Select this stay" action (rendered beside the card) drives selection. */}
        {offer && compact && (
          <div className="space-y-0.5 border-t border-[var(--border-subtle)] pt-2">
            <p className="text-xs text-[var(--text-muted)] truncate">{offer.roomName} · {offer.mealPlanName ?? mealLabel(offer.mealPlan)}</p>
            <p className="flex flex-wrap items-baseline gap-1.5">
              <span className="text-xs text-[var(--text-muted)]">Starting at</span>
              {originalPerNightMinor > 0 && (
                <span className="text-xs text-[var(--text-muted)] line-through">{formatMoney(originalPerNightMinor)}</span>
              )}
              <span className="text-lg font-semibold tracking-tight text-[var(--text-strong)]">{formatMoney(pricePerNightMinor)}</span>
              <span className="text-xs text-[var(--text-muted)]">/ night</span>
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              {offer.nights} night{offer.nights === 1 ? '' : 's'} total {formatMoney(offer.finalTotalMinor)}
            </p>
          </div>
        )}

        {/* Pricing + CTA: shown in 2-col layout (search results page). Hidden when hotel-card is in 3-col hotels page. */}
        {offer && !compact && (
          <div className="hcard-price-cta-inline flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-xs text-[var(--text-muted)]">{offer.roomName}</p>
              <p className="flex items-baseline gap-2">
                {originalPerNightMinor > 0 && (
                  <span className="text-sm text-[var(--text-muted)] line-through">{formatMoney(originalPerNightMinor)}</span>
                )}
                <span className="text-xl font-semibold tracking-tight text-[var(--text-strong)]">{formatMoney(pricePerNightMinor)}</span>
                <span className="text-sm text-[var(--text-muted)]">/ night before taxes & fees</span>
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {offer.nights} night{offer.nights === 1 ? '' : 's'} · {formatMoney(offer.finalTotalMinor)} total
                {offer.taxTotalMinor > 0 && ` · incl. ${formatMoney(offer.taxTotalMinor)} taxes`}{offer.feeTotalMinor > 0 && ` + ${formatMoney(offer.feeTotalMinor)} fees`}
              </p>
            </div>
            <div className="grid min-w-44 gap-2">
              <Button
                onClick={(event) => {
                  event.stopPropagation();
                  navigate(fullPath);
                }}
                className="bg-gradient-to-r from-brand-800 to-brand-600 font-semibold shadow-md hover:from-brand-900 hover:to-brand-700"
              >
                View Rooms &amp; Deals
              </Button>
              <Button
                variant="secondary"
                onClick={(event) => {
                  event.stopPropagation();
                  quickReserve();
                }}
                loading={reserving}
                disabled={unavailable}
              >
                {!reserving && <Sparkles className="h-4 w-4 text-brand-600" aria-hidden="true" />}
                {unavailable ? (temporarilyHeld ? 'Room currently held' : 'Sold out') : 'Quick Reserve'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT PRICING PANEL — visible only in hotels-page 3-column layout */}
      {(offer || hotel.price) && (
        <div className="hcard-pricing-panel">
          <div className="hcard-price-top">
            {originalPerNightMinor > 0 && (
              <div className="hcard-strikethrough-row">
                <span className="hcard-original-price">{formatMoney(originalPerNightMinor)}</span>
              </div>
            )}
            <div className="hcard-final-price-row">
              <span className="hcard-final-amount">{formatMoney(pricePerNightMinor)}</span>
              <span className="hcard-per-night">/ night before taxes & fees</span>
            </div>
            {offer && (offer.taxTotalMinor > 0 || offer.feeTotalMinor > 0) && (
              <p className="hcard-taxes-note">{offer.taxTotalMinor > 0 ? `+${formatMoney(offer.taxTotalMinor)} taxes` : ''}{offer.taxTotalMinor > 0 && offer.feeTotalMinor > 0 ? ' · ' : ''}{offer.feeTotalMinor > 0 ? `+${formatMoney(offer.feeTotalMinor)} fees` : ''}</p>
            )}
            {offer && (
              <p className="hcard-total-nights">
                Total: {formatMoney(offer.finalTotalMinor)}{offer.nights > 1 ? ` for ${offer.nights} nights` : ''}
              </p>
            )}
            {offer && !couponOffer && offer.memberDealCode ? (
              <div className="hcard-member-deal">
                <Sparkles className="h-3 w-3 shrink-0 mt-0.5 text-amber-500" aria-hidden="true" />
                <span>Member Deal: Extra {offer.memberDealAmount ? formatMoney(offer.memberDealAmount) : 'savings'} with code <strong>{offer.memberDealCode}</strong></span>
              </div>
            ) : null}
          </div>

          <div className="hcard-cta-group">
            <button
              type="button"
              className="hcard-btn-view"
              onClick={(event) => {
                event.stopPropagation();
                navigate(fullPath);
              }}
            >
              VIEW ROOMS &amp; DEALS
            </button>
            <button
              type="button"
              className="hcard-btn-reserve"
              onClick={(event) => {
                event.stopPropagation();
                if (offer && !unavailable) quickReserve();
                else navigate(fullPath);
              }}
              disabled={reserving || unavailable}
            >
              {reserving ? 'Reserving…' : unavailable ? (temporarilyHeld ? 'ROOM CURRENTLY HELD' : 'SOLD OUT') : 'Quick Reserve'}
            </button>
          </div>
        </div>
      )}

      </article>

      <GuestContactModal
        open={guestModalOpen}
        onClose={() => setGuestModalOpen(false)}
        onContinue={() => {
          setGuestModalOpen(false);
          startHold(pendingSelection);
        }}
      />
    </>
  );
}

export function HotelCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] md:flex-row" aria-hidden="true">
      <Skeleton className="aspect-[4/3] w-full md:aspect-auto md:w-72 lg:w-80" />
      <div className="flex-1 space-y-3 p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-2 pt-4">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-6 w-28" />
        </div>
      </div>
    </div>
  );
}
