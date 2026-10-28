import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, Check, ChevronLeft, ChevronRight, MapPin, ShieldCheck, Sparkles, Star, Tag, Undo2, UtensilsCrossed } from 'lucide-react';
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
import { normalizeAmenities } from '@/features/search/amenities.js';
import { discountDisplay } from '@/features/search/discountDisplay.js';
import { isIllustrativeCover } from '@/features/hotels/imageDisclaimer.js';
import { formatHotelLocation } from '@/features/hotels/hotelLocation.js';
import { bookingApi, discoveryApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { cn } from '@/lib/utils.js';

const MEAL_LABEL = { ROOM_ONLY: 'Room only', BREAKFAST: 'Breakfast included', HALF_BOARD: 'Half board', FULL_BOARD: 'Full board' };
const mealLabel = (code) => MEAL_LABEL[code] ?? String(code ?? 'Room rate').replaceAll('_', ' ').toLowerCase();
const PROPERTY_LABEL = { HOTEL: 'Hotel', RESORT: 'Resort', VILLA: 'Villa', APARTMENT: 'Apartment', HOSTEL: 'Hostel', GUEST_HOUSE: 'Guest house' };

/** Public hotel page path. Uses the city slug the rest of the site uses, plus the search stay if there is one. */
export function hotelPath(hotel, state) {
  const params = state ? stayParams(state) : new URLSearchParams();
  const query = params.toString();
  return `/hotels/${slugifyPlace(hotel.city)}/${hotel.slug}${query ? `?${query}` : ''}`;
}

/** One hotel in the results. Every value shown comes from the search response; nothing is estimated. */
export function HotelCard({ hotel, state }) {
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
  const { shown: amenities, moreCount: moreAmenityCount } = normalizeAmenities(hotel.amenities, 3);
  const fullPath = hotelPath(hotel, state);

  const [details, setDetails] = useState(null);
  const [detailsState, setDetailsState] = useState('idle');
  const [hovered, setHovered] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [guestModalOpen, setGuestModalOpen] = useState(false);
  const [pendingSelection, setPendingSelection] = useState(null);
  const [reserving, setReserving] = useState(false);

  const loadDetails = useCallback(() => {
    if (details || detailsState === 'loading') return;
    setDetailsState('loading');
    discoveryApi
      .hotel(hotel.slug)
      .then((result) => {
        setDetails(result);
        setDetailsState('ready');
      })
      .catch(() => setDetailsState('error'));
  }, [details, detailsState, hotel.slug]);

  const gallery = useMemo(() => {
    if (details?.images?.length) return details.images.filter((image) => image.url).slice(0, 6);
    return hotel.image?.url ? [{ id: `cover-${hotel.id}`, ...hotel.image }] : [];
  }, [details?.images, hotel.id, hotel.image]);

  useEffect(() => {
    if (!hovered) {
      setPhotoIndex(0);
    } else if (gallery.length > 1) {
      setPhotoIndex(1);
    }
  }, [hovered, gallery.length]);

  const startHold = async (selection) => {
    if (!selection) return;
    setReserving(true);
    try {
      const hold = await bookingApi.createHold({
        hotelId: selection.hotelId,
        roomTypeId: selection.roomTypeId,
        ratePlanId: selection.ratePlanId,
        checkIn: selection.checkIn,
        checkOut: selection.checkOut,
        rooms: selection.rooms,
        occupancy: selection.occupancy,
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
    if (!offer || !state?.checkIn || !state?.checkOut || !state?.occupancy?.length) return;
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
      occupancy: state.occupancy.map((room) => ({ adults: room.adults, childAges: room.childAges })),
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
      <article className="customer-hotel-card group flex flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] transition-all duration-500 hover:-translate-y-1.5 hover:border-brand-300 hover:shadow-xl md:flex-row">
      <div
        className="relative aspect-[4/3] w-full shrink-0 overflow-hidden md:aspect-auto md:w-72 lg:w-80"
        onMouseEnter={() => {
          setHovered(true);
          loadDetails();
        }}
        onMouseLeave={() => setHovered(false)}
      >
        {gallery.length > 0 ? gallery.map((image, index) => (
          <SafeImage
            key={image.id ?? image.url}
            src={image.url}
            alt={image.altText ?? `${hotel.name} photo ${index + 1}`}
            className={cn(
              'absolute inset-0 transition-all duration-500 ease-out motion-reduce:transition-none',
              index === photoIndex ? 'scale-100 opacity-100 group-hover:scale-[1.035]' : 'scale-[1.02] opacity-0',
            )}
            sizes="(min-width: 1024px) 320px, (min-width: 768px) 288px, 100vw"
            fallbackLabel={`${hotel.name}: photo ${index + 1}`}
          />
        )) : (
          <SafeImage className="absolute inset-0" fallbackLabel={`${hotel.name}: photos coming soon`} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/0 to-transparent transition-colors duration-500 group-hover:from-slate-950/15" />
        {gallery.length > 1 && (
          <>
            <button
              type="button"
              className="absolute left-3 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-800 opacity-0 shadow-md transition-opacity hover:bg-white group-hover:opacity-100 focus:opacity-100"
              aria-label="Previous hotel photo"
              onClick={(event) => {
                event.preventDefault();
                setPhotoIndex((index) => (index - 1 + gallery.length) % gallery.length);
              }}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="absolute right-3 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-800 opacity-0 shadow-md transition-opacity hover:bg-white group-hover:opacity-100 focus:opacity-100"
              aria-label="Next hotel photo"
              onClick={(event) => {
                event.preventDefault();
                setPhotoIndex((index) => (index + 1) % gallery.length);
              }}
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1 rounded-full bg-slate-950/70 px-2.5 py-1 text-[11px] font-medium text-white">
              <Camera className="h-3 w-3" aria-hidden="true" /> {photoIndex + 1}/{gallery.length}
            </span>
          </>
        )}
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

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 md:p-5">
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
            <h3 className="truncate text-lg font-semibold tracking-tight text-[var(--text-strong)]">
              <Link to={fullPath} className="hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500">
                {hotel.name}
              </Link>
            </h3>
            <p className="hcard-location-row flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden="true" />
              <span className="truncate">{place}</span>
            </p>
            {hotel.distanceKm != null && (
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

        {amenities.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-body)]">
            {amenities.map((name) => (
              <li key={name} className="flex items-center gap-1">
                <Check className="h-3.5 w-3.5 text-success-600" aria-hidden="true" /> {name}
              </li>
            ))}
            {moreAmenityCount > 0 && <li className="text-[var(--text-muted)]">+{moreAmenityCount} more</li>}
          </ul>
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

        {/* Pricing + CTA: shown in 2-col layout (search results page). Hidden when hotel-card is in 3-col hotels page. */}
        {offer && (
          <div className="hcard-price-cta-inline flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-xs text-[var(--text-muted)]">{offer.roomName}</p>
              <p className="flex items-baseline gap-2">
                {originalPerNightMinor > 0 && (
                  <span className="text-sm text-[var(--text-muted)] line-through">{formatMoney(originalPerNightMinor)}</span>
                )}
                <span className="text-xl font-semibold tracking-tight text-[var(--text-strong)]">{formatMoney(pricePerNightMinor)}</span>
                <span className="text-sm text-[var(--text-muted)]">/ night before taxes</span>
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {offer.nights} night{offer.nights === 1 ? '' : 's'} · {formatMoney(offer.finalTotalMinor)} total
                {offer.taxTotalMinor + offer.feeTotalMinor > 0 && ` · incl. ${formatMoney(offer.taxTotalMinor + offer.feeTotalMinor)} taxes & fees`}
              </p>
            </div>
            <div className="grid min-w-44 gap-2">
              <Button
                onClick={() => navigate(fullPath)}
                className="bg-gradient-to-r from-brand-800 to-brand-600 font-semibold shadow-md hover:from-brand-900 hover:to-brand-700"
              >
                View Rooms &amp; Deals
              </Button>
              <Button variant="secondary" onClick={quickReserve} loading={reserving}>
                {!reserving && <Sparkles className="h-4 w-4 text-brand-600" aria-hidden="true" />}
                Quick Reserve
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
                {discountPercent > 0 && (
                  <span className="hcard-discount-pill">{discountPercent}% OFF</span>
                )}
              </div>
            )}
            <div className="hcard-final-price-row">
              <span className="hcard-final-amount">{formatMoney(pricePerNightMinor)}</span>
              <span className="hcard-per-night">/ night before taxes</span>
            </div>
            {offer && offer.taxTotalMinor + offer.feeTotalMinor > 0 && (
              <p className="hcard-taxes-note">+{formatMoney(offer.taxTotalMinor + offer.feeTotalMinor)} taxes &amp; fees for the stay</p>
            )}
            {offer && offer.nights > 1 && (
              <p className="hcard-total-nights">{formatMoney(offer.finalTotalMinor)} for {offer.nights} nights</p>
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
              onClick={() => navigate(fullPath)}
            >
              VIEW ROOMS &amp; DEALS
            </button>
            <button
              type="button"
              className="hcard-btn-reserve"
              onClick={offer ? quickReserve : () => navigate(fullPath)}
              disabled={reserving}
            >
              {reserving ? 'Reserving…' : 'Quick Reserve'}
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
