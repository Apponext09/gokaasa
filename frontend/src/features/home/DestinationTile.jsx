import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { SafeImage } from '@/components/shared/SafeImage.jsx';
import { destinationSearchPath } from '@/features/search/searchParams.js';

/** One destination tile, shared by the homepage's Popular Destinations and the full Destinations page. */
export function DestinationTile({ place }) {
  return (
    <Link
      to={destinationSearchPath(place.destination)}
      className="group relative isolate flex min-h-[146px] min-w-0 flex-col overflow-hidden rounded-2xl border border-white/60 bg-slate-900 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      <SafeImage
        src={place.imageUrl}
        alt={`Illustrative view of ${place.label}`}
        className="absolute inset-0 -z-20 transition-transform duration-700 ease-out group-hover:scale-105"
        sizes="(min-width: 1024px) 320px, (min-width: 768px) 33vw, 50vw"
        fallbackLabel={`${place.label} destination image`}
        showFallbackContent={false}
      />
      <span className="absolute inset-0 -z-10 bg-gradient-to-t from-slate-950 via-slate-950/25 to-slate-950/5" aria-hidden="true" />

      <span className="flex min-w-0 items-start p-3 sm:p-4">
        <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border border-white/25 bg-slate-950/35 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{place.country}</span>
        </span>
      </span>

      <span className="mt-auto block min-w-0 p-4 text-white sm:p-5">
        <span className="block break-words font-[var(--font-display)] text-lg font-semibold leading-tight tracking-tight sm:text-2xl">{place.label}</span>
        <span className="mt-1 block text-sm text-white/80">
          Explore {place.hotelCount} hotel{place.hotelCount === 1 ? '' : 's'}
        </span>
      </span>
    </Link>
  );
}
