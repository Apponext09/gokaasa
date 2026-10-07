import { Link } from 'react-router-dom';
import { Check, MapPin, Star } from 'lucide-react';
import { Badge } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { SafeImage } from '@/components/shared/SafeImage.jsx';
import { WishlistButton } from '@/components/shared/WishlistButton.jsx';
import { formatMoney } from '@/components/shared/index.jsx';
import { slugifyPlace } from '@/features/search/searchParams.js';

/**
 * A homepage teaser card for Hotels Near You / Handpicked Hotels -- no stay/occupancy context, so no
 * cancellation/meal-plan badges like the search results' HotelCard. Price, where present, is a
 * representative "from" rate for one night, not an availability-checked total.
 */
export function CuratedHotelCard({ hotel }) {
  const place = [hotel.area, hotel.city].filter(Boolean).join(', ');
  const amenities = [...new Set(hotel.amenities)].slice(0, 2);
  const detailsPath = `/hotels/${slugifyPlace(hotel.city)}/${hotel.slug}`;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] transition-shadow hover:shadow-md">
      <div className="relative aspect-[16/10] w-full">
        <SafeImage
          src={hotel.image?.url}
          alt={hotel.image?.altText ?? hotel.name}
          className="absolute inset-0 transition-transform duration-300 hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100"
          sizes="320px"
          fallbackLabel={`${hotel.name}: photos coming soon`}
        />
        {hotel.price?.discountPercent > 0 && (
          <div className="absolute left-3 top-3">
            <Badge tone="premium">{hotel.price.discountPercent}% OFF</Badge>
          </div>
        )}
        <div className="absolute right-3 top-3">
          <WishlistButton hotelId={hotel.id} initial={hotel.wishlisted} hotelName={hotel.name} variant="chip" />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="truncate text-base font-semibold tracking-tight text-[var(--text-strong)]">
          <Link to={detailsPath} className="hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500">
            {hotel.name}
          </Link>
        </h3>
        <p className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{place}</span>
          {hotel.distanceKm != null && <span className="shrink-0 font-medium text-[var(--text-body)]">· {hotel.distanceKm.toFixed(1)} km away</span>}
        </p>

        <div className="flex items-center gap-2">
          {hotel.guestRating != null || hotel.rating ? (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--text-strong)]">
              <Star className="h-3.5 w-3.5 fill-accent-500 text-accent-500" aria-hidden="true" />
              {(hotel.guestRating ?? hotel.rating.average).toFixed(1)}
            </span>
          ) : (
            <Badge tone="neutral">New</Badge>
          )}
          {(hotel.reviewCount > 0 || hotel.rating?.count > 0) && (
            <span className="text-xs text-[var(--text-muted)]">({(hotel.guestRating != null ? hotel.reviewCount : hotel.rating.count).toLocaleString('en-IN')})</span>
          )}
        </div>

        {amenities.length > 0 && (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-body)]">
            {amenities.map((name) => (
              <li key={name} className="flex items-center gap-1">
                <Check className="h-3 w-3 text-success-600" aria-hidden="true" /> {name}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          {hotel.price ? (
            <p className="space-y-0.5">
              {hotel.price.originalAmountMinor && (
                <span className="block text-xs text-[var(--text-muted)] line-through">{formatMoney(hotel.price.originalAmountMinor)}</span>
              )}
              <span className="block text-base font-semibold text-[var(--text-strong)]">
                {formatMoney(hotel.price.amountMinor)} <span className="text-xs font-normal text-[var(--text-muted)]">/ night</span>
              </span>
            </p>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">See rates</span>
          )}
          <Link to={detailsPath}>
            <Button size="sm">View Hotel</Button>
          </Link>
        </div>
      </div>
    </article>
  );
}

export function CuratedHotelCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)]" aria-hidden="true">
      <div className="aspect-[16/10] w-full animate-pulse bg-[var(--surface-muted)]" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--surface-muted)]" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--surface-muted)]" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--surface-muted)]" />
      </div>
    </div>
  );
}
