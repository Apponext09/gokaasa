import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { HotelCard, HotelCardSkeleton } from '@/features/search/components/HotelCard.jsx';
import { PageHeader, EmptyState, Pagination } from '@/components/shared/index.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';
import { discoveryApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const WISHLIST_PAGE_SIZE = 8;

export function WishlistPage() {
  const [hotels, setHotels] = useState(null);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);

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

  const totalPages = Math.max(1, Math.ceil((hotels?.length ?? 0) / WISHLIST_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleHotels = hotels?.slice((currentPage - 1) * WISHLIST_PAGE_SIZE, currentPage * WISHLIST_PAGE_SIZE) ?? [];

  return (
    <div className="wishlist-page mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader title="Saved hotels" description="Hotels you've saved for later." />

      {error && <p className="mt-6 text-sm text-danger-600">{error}</p>}

      {!hotels && !error && (
        <div className="wishlist-hotels-grid mt-6 grid gap-4">
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
        <>
          <div className="wishlist-hotels-grid mt-6 grid gap-4">
            {visibleHotels.map((hotel) => (
              <HotelCard key={hotel.id} hotel={hotel} />
            ))}
          </div>
          <div className="mt-6">
            <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </>
      )}
    </div>
  );
}
