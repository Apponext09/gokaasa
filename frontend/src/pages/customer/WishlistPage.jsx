import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { HotelCardSkeleton, HotelCard } from '@/features/search/components/HotelCard.jsx';
import { PageHeader, EmptyState } from '@/components/shared/index.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';
import { discoveryApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

export function WishlistPage() {
  const [hotels, setHotels] = useState(null);
  const [error, setError] = useState(null);

  useDocumentMeta({ title: 'Gokaasa | Saved hotels', canonicalPath: '/wishlist' });

  useEffect(() => {
    let cancelled = false;
    discoveryApi
      .wishlist()
      .then((items) => !cancelled && setHotels(items))
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader title="Saved hotels" description="Hotels you've saved for later." />

      {error && <p className="mt-6 text-sm text-danger-600">{error}</p>}

      {!hotels && !error && (
        <div className="mt-6 space-y-4">
          {[0, 1, 2].map((i) => <HotelCardSkeleton key={i} />)}
        </div>
      )}

      {hotels?.length === 0 && (
        <EmptyState
          className="mt-6"
          icon={Heart}
          title="Save your favourite stays here"
          description="Tap the heart on any hotel to keep it for later."
          action={
            <Link to="/destinations">
              <Button variant="secondary">Explore hotels</Button>
            </Link>
          }
        />
      )}

      {hotels?.length > 0 && (
        <div className="mt-6 space-y-4">
          {hotels.map((hotel) => (
            <HotelCard key={hotel.id} hotel={hotel} />
          ))}
        </div>
      )}
    </div>
  );
}
