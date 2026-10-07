import { Link } from 'react-router-dom';
import { Check, MapPin, ShieldCheck, Star, Undo2, UtensilsCrossed } from 'lucide-react';
import { Badge, Skeleton } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { SafeImage } from '@/components/shared/SafeImage.jsx';
import { WishlistButton } from '@/components/shared/WishlistButton.jsx';
import { formatMoney } from '@/components/shared/index.jsx';
import { stayParams, slugifyPlace } from '@/features/search/searchParams.js';

const MEAL_LABEL = { ROOM_ONLY: 'Room only', BREAKFAST: 'Breakfast included', HALF_BOARD: 'Half board', FULL_BOARD: 'Full board' };
const PROPERTY_LABEL = { HOTEL: 'Hotel', RESORT: 'Resort', VILLA: 'Villa', APARTMENT: 'Apartment', HOSTEL: 'Hostel', GUEST_HOUSE: 'Guest house' };

/** Public hotel page path. Uses the city slug the rest of the site uses, plus the search stay if there is one. */
export function hotelPath(hotel, state) {
  const params = state ? stayParams(state) : new URLSearchParams();
  const query = params.toString();
  return `/hotels/${slugifyPlace(hotel.city)}/${hotel.slug}${query ? `?${query}` : ''}`;
}

/** One hotel in the results. Every value shown comes from the search response; nothing is estimated. */
export function HotelCard({ hotel, state }) {
  const offer = hotel.bestOffer;
  const place = [hotel.area, hotel.city, hotel.country].filter(Boolean).join(', ');
  const hasDiscount = offer?.discountTotalMinor > 0;
  const originalPerNightMinor = hasDiscount ? Math.round(offer.baseTotalMinor / offer.nights) : null;
  const discountPercent = hasDiscount ? Math.round((offer.discountTotalMinor / offer.baseTotalMinor) * 100) : null;

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] transition-shadow hover:shadow-md md:flex-row">
      <div className="relative aspect-[4/3] w-full shrink-0 md:aspect-auto md:w-72 lg:w-80">
        <SafeImage
          src={hotel.image?.url}
          alt={hotel.image?.altText ?? hotel.name}
          className="absolute inset-0"
          sizes="(min-width: 1024px) 320px, (min-width: 768px) 288px, 100vw"
          fallbackLabel={`${hotel.name}: photos coming soon`}
        />
        <div className="absolute right-3 top-3">
          <WishlistButton hotelId={hotel.id} initial={hotel.wishlisted} hotelName={hotel.name} variant="chip" />
        </div>
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
              <span className="text-xs text-[var(--text-muted)]">{PROPERTY_LABEL[hotel.propertyType] ?? 'Stay'}</span>
            )}
            <h3 className="truncate text-lg font-semibold tracking-tight text-[var(--text-strong)]">
              <Link to={hotelPath(hotel, state)} className="hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500">
                {hotel.name}
              </Link>
            </h3>
            <p className="flex items-center gap-1 text-sm text-[var(--text-muted)]">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{place}</span>
            </p>
          </div>
          {/* The provider's guest rating, where there is one. Otherwise Gokaasa's own guest reviews fill the gap rather than showing nothing. */}
          {(hotel.guestRating != null || hotel.rating) && (
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
          )}
        </div>

        {hotel.amenities.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-body)]">
            {hotel.amenities.slice(0, 3).map((name) => (
              <li key={name} className="flex items-center gap-1">
                <Check className="h-3.5 w-3.5 text-success-600" aria-hidden="true" /> {name}
              </li>
            ))}
          </ul>
        )}

        {offer && (
          <div className="mt-auto space-y-3 border-t border-[var(--border-subtle)] pt-3">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="brand">
                <UtensilsCrossed className="h-3 w-3" aria-hidden="true" /> {MEAL_LABEL[offer.mealPlan]}
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
              {discountPercent > 0 && <Badge tone="premium">{discountPercent}% off</Badge>}
            </div>

            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-0.5">
                <p className="text-xs text-[var(--text-muted)]">{offer.roomName}</p>
                <p className="flex items-baseline gap-2">
                  {originalPerNightMinor > 0 && (
                    <span className="text-sm text-[var(--text-muted)] line-through">{formatMoney(originalPerNightMinor)}</span>
                  )}
                  <span className="text-xl font-semibold tracking-tight text-[var(--text-strong)]">{formatMoney(offer.pricePerNightMinor)}</span>
                  <span className="text-sm text-[var(--text-muted)]">/ night</span>
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {offer.nights} night{offer.nights === 1 ? '' : 's'} · {formatMoney(offer.finalTotalMinor)} total
                  {offer.taxTotalMinor + offer.feeTotalMinor > 0 && ` · incl. ${formatMoney(offer.taxTotalMinor + offer.feeTotalMinor)} taxes & fees`}
                </p>
              </div>
              <Link to={hotelPath(hotel, state)}>
                <Button>View Rooms</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </article>
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
