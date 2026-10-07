import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Compass, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Alert } from '@/components/ui/surfaces.jsx';
import { EmptyState, PageHeader, Pagination } from '@/components/shared/index.jsx';
import { CuratedHotelCard, CuratedHotelCardSkeleton } from '@/features/home/CuratedHotelCard.jsx';
import { useGeolocation } from '@/features/home/useGeolocation.js';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';
import { discoveryApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const RADIUS_KM = 25;
const LIMIT = 12;

export function NearbyHotelsPage() {
  const [params, setParams] = useSearchParams();
  const urlLat = Number(params.get('lat'));
  const urlLng = Number(params.get('lng'));
  const page = Number(params.get('page')) || 1;
  const hasUrlCoords = Number.isFinite(urlLat) && Number.isFinite(urlLng);

  const { status: geoStatus, coords: geoCoords, request } = useGeolocation();
  const coords = hasUrlCoords ? { lat: urlLat, lng: urlLng } : geoCoords;

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useDocumentMeta({ title: 'Hotels Near You | Gokaasa', description: 'Hotels close to your current location, nearest first.' });

  useEffect(() => {
    if (!coords) return undefined;
    let active = true;
    setError(null);
    setData(null);
    discoveryApi
      .nearbyHotels({ lat: coords.lat, lng: coords.lng, radiusKm: RADIUS_KM, page, limit: LIMIT })
      .then((result) => active && setData(result))
      .catch((err) => active && setError(normalizeError(err).message));
    return () => {
      active = false;
    };
  }, [coords, page]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-10 sm:px-6">
      <PageHeader title="Hotels Near You" description="Discover great stays close to your current location." />

      {!coords && (
        <div className="flex flex-col items-start gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-8">
          <p className="text-sm text-[var(--text-body)]">Allow location access to see hotels close to where you are right now.</p>
          <Button onClick={request} loading={geoStatus === 'requesting'}>
            <MapPin className="h-4 w-4" aria-hidden="true" /> Find Hotels Near Me
          </Button>
          {geoStatus === 'denied' && (
            <Alert tone="warning" title="We couldn't access your location.">
              <Link to="/destinations" className="font-medium text-brand-700 hover:underline">Choose a destination instead</Link>
            </Alert>
          )}
          {geoStatus === 'unavailable' && <Alert tone="info">Location isn't available on this device or browser.</Alert>}
          {geoStatus === 'timeout' && (
            <Alert tone="warning" title="That took too long.">
              <Button size="sm" variant="secondary" onClick={request}>Retry</Button>
            </Alert>
          )}
        </div>
      )}

      {coords && error && (
        <Alert tone="error" title="Unable to find hotels near you.">
          Try another location.
        </Alert>
      )}

      {coords && !error && data === null && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <CuratedHotelCardSkeleton key={i} />)}
        </div>
      )}

      {coords && !error && data?.items.length === 0 && (
        <EmptyState
          icon={Compass}
          title="No hotels found nearby"
          description={`We couldn't find a published hotel within ${RADIUS_KM}km of your location.`}
          action={<Link to="/destinations"><Button variant="secondary">Explore Hotels</Button></Link>}
        />
      )}

      {coords && !error && data?.items.length > 0 && (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((hotel) => <CuratedHotelCard key={hotel.id} hotel={hotel} />)}
          </div>
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onPageChange={(next) => setParams((prev) => {
              const updated = new URLSearchParams(prev);
              updated.set('page', String(next));
              return updated;
            })}
          />
        </>
      )}
    </div>
  );
}
