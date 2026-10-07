import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { Skeleton } from '@/components/ui/surfaces.jsx';
import { PageHeader, EmptyState } from '@/components/shared/index.jsx';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';
import { discoveryApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

export function DestinationsPage() {
  const [places, setPlaces] = useState(null);
  const [error, setError] = useState(null);

  useDocumentMeta({
    title: 'Gokaasa | Browse destinations',
    description: 'Browse hotels by destination, from popular cities to emerging favourites.',
    canonicalPath: '/destinations',
  });

  useEffect(() => {
    let cancelled = false;
    discoveryApi
      .popularDestinations({ limit: 24 })
      .then((items) => !cancelled && setPlaces(items))
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <PageHeader title="Destinations" description="Browse hotels by city, from our most popular stays to emerging favourites." />

      {error && <p className="mt-6 text-sm text-danger-600">{error}</p>}

      {!places && !error && (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      )}

      {places?.length === 0 && (
        <EmptyState
          className="mt-6"
          icon={MapPin}
          title="No destinations yet"
          description="Published hotels will appear here as soon as they're live."
        />
      )}

      {places?.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {places.map((place) => (
            <Link
              key={place.destination}
              to={`/hotels/${place.destination}`}
              className="group flex flex-col justify-between rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <MapPin className="h-4 w-4 text-brand-700" aria-hidden="true" />
              <span className="mt-3 text-base font-semibold text-[var(--text-strong)] group-hover:text-brand-700">{place.label}</span>
              <span className="text-xs text-[var(--text-muted)]">
                {place.hotelCount} hotel{place.hotelCount === 1 ? '' : 's'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
