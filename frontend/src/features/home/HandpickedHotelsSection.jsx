import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Carousel, CarouselItem } from '@/components/ui/carousel.jsx';
import { EmptyState } from '@/components/shared/index.jsx';
import { StaggeredReveal } from '@/components/shared/StaggeredReveal.jsx';
import { CuratedHotelCard, CuratedHotelCardSkeleton } from './CuratedHotelCard.jsx';
import { discoveryApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

export function HandpickedHotelsSection() {
  const [hotels, setHotels] = useState(null);
  const [error, setError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    setHotels(null);
    discoveryApi
      .handpickedHotels({ limit: 10 })
      .then((result) => active && setHotels(result.items))
      .catch((err) => active && setError(normalizeError(err).message));
    return () => {
      active = false;
    };
  }, [retryKey]);

  if (hotels !== null && hotels.length === 0 && !error) return null;

  return (
    <section id="handpicked" aria-labelledby="handpicked-heading" className="mx-auto max-w-7xl space-y-5 px-4 sm:px-6">
      <div>
        <h2 id="handpicked-heading" className="font-[var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--text-strong)] sm:text-3xl">
          Handpicked Hotels For You
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Exclusive prices and more with every booking.</p>
      </div>

      {error && (
        <EmptyState
          title="Unable to load hotels right now."
          description={error}
          action={<Button variant="secondary" onClick={() => setRetryKey((k) => k + 1)}>Try Again</Button>}
        />
      )}

      {!error && hotels === null && (
        <Carousel aria-label="Handpicked hotels loading">
          {Array.from({ length: 4 }, (_, i) => (
            <CarouselItem key={i} className="w-64 sm:w-72">
              <CuratedHotelCardSkeleton />
            </CarouselItem>
          ))}
        </Carousel>
      )}

      {!error && hotels?.length > 0 && (
        <Carousel aria-label="Handpicked hotels" autoScroll>
          {hotels.map((hotel, index) => (
            <CarouselItem key={hotel.id} className="w-64 sm:w-72">
              <StaggeredReveal index={index} className="h-full">
                <CuratedHotelCard hotel={hotel} />
              </StaggeredReveal>
            </CarouselItem>
          ))}
        </Carousel>
      )}
    </section>
  );
}
