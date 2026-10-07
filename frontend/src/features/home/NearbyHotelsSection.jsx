import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, MapPin, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Alert } from '@/components/ui/surfaces.jsx';
import { Carousel, CarouselItem } from '@/components/ui/carousel.jsx';
import { EmptyState } from '@/components/shared/index.jsx';
import { CuratedHotelCard, CuratedHotelCardSkeleton } from './CuratedHotelCard.jsx';
import { useGeolocation } from './useGeolocation.js';
import { discoveryApi } from '@/services/endpoints.js';

const RADIUS_KM = 25;
const LIMIT = 8;

export function NearbyHotelsSection() {
  const { status: geoStatus, coords, request } = useGeolocation();
  const [hotels, setHotels] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (geoStatus !== 'granted' || !coords) return undefined;
    let active = true;
    setError(null);
    setHotels(null);
    discoveryApi
      .nearbyHotels({ lat: coords.lat, lng: coords.lng, radiusKm: RADIUS_KM, limit: LIMIT })
      .then((result) => active && setHotels(result.items))
      .catch(() => active && setError('Unable to find hotels near you. Try another location.'));
    return () => {
      active = false;
    };
  }, [geoStatus, coords]);

  return (
    <section id="nearby" aria-labelledby="nearby-heading" className="mx-auto max-w-7xl space-y-5 px-4 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="nearby-heading" className="font-[var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--text-strong)] sm:text-3xl">
            Hotels Near You
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Discover great stays close to your current location.</p>
        </div>
        {hotels?.length > 0 && (
          <Link to={`/hotels/nearby?lat=${coords.lat}&lng=${coords.lng}`} className="text-sm font-medium text-brand-700 hover:underline">
            View all nearby hotels
          </Link>
        )}
      </div>

      {geoStatus === 'idle' && (
        <div className="flex flex-col items-start gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-8">
          <p className="text-sm text-[var(--text-body)]">Allow location access to see hotels close to where you are right now.</p>
          <Button onClick={request}>
            <MapPin className="h-4 w-4" aria-hidden="true" /> Find Hotels Near Me
          </Button>
        </div>
      )}

      {geoStatus === 'requesting' && (
        <Carousel aria-label="Hotels near you loading">
          {Array.from({ length: 4 }, (_, i) => (
            <CarouselItem key={i} className="w-64 sm:w-72">
              <CuratedHotelCardSkeleton />
            </CarouselItem>
          ))}
        </Carousel>
      )}

      {geoStatus === 'denied' && (
        <Alert tone="warning" title="We couldn't access your location.">
          <span className="flex flex-wrap items-center gap-3">
            You can still browse hotels by destination instead.
            <Link to="/destinations">
              <Button size="sm" variant="secondary">Choose a destination</Button>
            </Link>
          </span>
        </Alert>
      )}

      {geoStatus === 'unavailable' && (
        <Alert tone="info" title="Location isn't available on this device or browser.">
          <Link to="/destinations" className="font-medium text-brand-700 hover:underline">Choose a destination instead</Link>
        </Alert>
      )}

      {geoStatus === 'timeout' && (
        <Alert tone="warning" title="That took too long.">
          <span className="flex flex-wrap items-center gap-3">
            Your location request timed out.
            <Button size="sm" variant="secondary" onClick={request}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
            </Button>
          </span>
        </Alert>
      )}

      {geoStatus === 'granted' && error && (
        <Alert tone="error" title="Unable to find hotels near you.">
          <span className="flex flex-wrap items-center gap-3">
            Try another location.
            <Button size="sm" variant="secondary" onClick={request}>Try again</Button>
          </span>
        </Alert>
      )}

      {geoStatus === 'granted' && !error && hotels === null && (
        <Carousel aria-label="Hotels near you loading">
          {Array.from({ length: 4 }, (_, i) => (
            <CarouselItem key={i} className="w-64 sm:w-72">
              <CuratedHotelCardSkeleton />
            </CarouselItem>
          ))}
        </Carousel>
      )}

      {geoStatus === 'granted' && !error && hotels?.length === 0 && (
        <EmptyState
          icon={Compass}
          title="No hotels found nearby"
          description={`We couldn't find a published hotel within ${RADIUS_KM}km of your location.`}
          action={<Link to="/destinations"><Button variant="secondary">Explore Hotels</Button></Link>}
        />
      )}

      {geoStatus === 'granted' && !error && hotels?.length > 0 && (
        <Carousel aria-label="Hotels near you">
          {hotels.map((hotel) => (
            <CarouselItem key={hotel.id} className="w-64 sm:w-72">
              <CuratedHotelCard hotel={hotel} />
            </CarouselItem>
          ))}
        </Carousel>
      )}
    </section>
  );
}
