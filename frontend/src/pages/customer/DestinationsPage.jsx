import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Skeleton } from '@/components/ui/surfaces.jsx';
import { PageHeader, EmptyState } from '@/components/shared/index.jsx';
import { DestinationTile } from '@/features/home/DestinationTile.jsx';
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
            <DestinationTile key={place.destination} place={place} />
          ))}
        </div>
      )}
    </div>
  );
}
