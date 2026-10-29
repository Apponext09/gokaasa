import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { SafeImage } from '@/components/shared/SafeImage.jsx';
import { destinationSearchPath } from '@/features/search/searchParams.js';
import { cn } from '@/lib/utils.js';

/**
 * One reusable card for both "Explore Stays Around You" (variant="grid", small area tiles) and
 * "Find Your Next Favourite Place" (variant="feature", bigger city cards with a description + CTA).
 * `hotelCount` is only ever a real number from the backend (discoveryApi.suggestDestinations /
 * popularDestinations) -- callers must omit/hide a place entirely rather than pass a 0 or guessed count.
 */
export function DestinationCard({ variant = 'grid', label, description, imageUrl, hotelCount, citySlug, area, className }) {
  const href = destinationSearchPath(citySlug, new Date(), area ? { area } : {});
  const isFeature = variant === 'feature';

  return (
    <Link
      to={href}
      className={cn(
        'group relative flex flex-col justify-end overflow-hidden rounded-[var(--radius-card)]',
        isFeature ? 'aspect-[16/11]' : 'aspect-[4/3]',
        className,
      )}
    >
      <SafeImage
        src={imageUrl}
        alt={`${label} hotels`}
        className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-105"
        fallbackLabel={`${label} photo`}
        showFallbackContent={false}
      />
      <span className="pop-card-overlay" aria-hidden="true" />

      <div className="relative z-10 p-4 text-white">
        <h3 className={cn('font-[var(--font-display)] font-semibold tracking-tight', isFeature ? 'text-xl' : 'text-base')}>{label}</h3>
        {isFeature && description && <p className="mt-1 text-sm text-white/80">{description}</p>}
        {hotelCount > 0 && (
          <p className="mt-1 text-xs font-medium text-white/85">
            {hotelCount} hotel{hotelCount === 1 ? '' : 's'} available
          </p>
        )}
        {isFeature && (
          <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent-300">
            Explore Stays <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
      </div>
    </Link>
  );
}
