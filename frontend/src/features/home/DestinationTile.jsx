import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';

/** One destination tile, shared by the homepage's Popular Destinations and the full Destinations page. */
export function DestinationTile({ place }) {
  return (
    <Link
      to={`/hotels/${place.destination}`}
      className="group flex flex-col justify-between rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      <MapPin className="h-4 w-4 text-brand-700" aria-hidden="true" />
      <span className="mt-3 text-base font-semibold text-[var(--text-strong)] group-hover:text-brand-700">{place.label}</span>
      <span className="text-xs text-[var(--text-muted)]">
        {place.hotelCount} hotel{place.hotelCount === 1 ? '' : 's'}
      </span>
    </Link>
  );
}
