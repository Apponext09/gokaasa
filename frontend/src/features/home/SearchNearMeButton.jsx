import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LocateFixed, Loader2 } from 'lucide-react';
import { useGeolocation } from '@/features/home/useGeolocation.js';

const LABEL = {
  idle: 'Search hotels near me',
  requesting: 'Getting your location…',
  denied: 'Location permission denied',
  timeout: 'Could not get your location',
  unavailable: 'Location not available',
};

/**
 * Permission is requested only on click (never automatically) -- a second, independent
 * `useGeolocation` instance from the one `NearbyHotelsSection` owns further down the page, since that
 * section may not even be mounted yet (it's lazy/IntersectionObserver-gated). On success this just
 * navigates to the real nearby-hotels results page; it fetches no hotel data itself.
 */
export function SearchNearMeButton({ className = '' }) {
  const { status, coords, request } = useGeolocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === 'granted' && coords) {
      navigate(`/hotels/nearby?lat=${coords.lat}&lng=${coords.lng}`);
    }
  }, [status, coords, navigate]);

  const isBusy = status === 'requesting';
  const isBlocked = status === 'denied' || status === 'timeout' || status === 'unavailable';

  return (
    <button
      type="button"
      onClick={request}
      disabled={isBusy}
      title="We only ask for your location when you click this"
      className={`customer-near-me-btn ${className}`}
    >
      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LocateFixed className="h-4 w-4" aria-hidden="true" />}
      {isBlocked ? LABEL[status] : LABEL.idle}
    </button>
  );
}
