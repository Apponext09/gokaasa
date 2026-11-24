import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Hotel } from 'lucide-react';
import { bookingApi } from '@/services/endpoints.js';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { HoldCountdown } from '@/features/booking/components/HoldCountdown.jsx';
import { Button } from '@/components/ui/button.jsx';

/**
 * ActiveHoldCard — compact, slim banner shown on the web homepage when the
 * logged-in user has an active room hold.
 * Keeps only the essentials: Room/Hotel name, live timer, Resume and Cancel buttons.
 */
export function ActiveHoldCard() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [hold, setHold]         = useState(null);
  const [ready, setReady]       = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchActiveHold = useCallback(() => {
    if (!isAuthenticated) return;
    return bookingApi
      .activeHold()
      .then((h) => {
        if (!mountedRef.current) return;
        setHold(h ?? null);
        setReady(true);
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setHold(null);
        setReady(true);
      });
  }, [isAuthenticated]);

  useEffect(() => {
    setHold(null);
    setReady(false);
    fetchActiveHold();
  }, [fetchActiveHold]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchActiveHold();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchActiveHold]);

  const handleResume = () => {
    if (!hold) return;
    navigate(`/booking/guest-details?holdId=${hold.id}`);
  };

  const handleCancel = async () => {
    if (!hold) return;
    if (!window.confirm('Release your room hold? The room will return to public availability.')) return;
    setCancelling(true);
    try {
      await bookingApi.release(hold.id);
      if (mountedRef.current) setHold(null);
    } catch (err) {
      if (err?.response?.status === 404 || err?.response?.status === 409) {
        if (mountedRef.current) setHold(null);
      }
    } finally {
      if (mountedRef.current) setCancelling(false);
    }
  };

  // Not authenticated, loading, or no active hold → render nothing
  if (!isAuthenticated || !ready || !hold) return null;

  const hotelName = hold.quote?.hotel?.name || 'Hotel';
  const roomName  = hold.quote?.room?.name || 'Room';
  const roomCount = hold.rooms ?? 1;

  return (
    <div
      role="region"
      aria-label="Active room hold"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-4xl"
    >
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-brand-200/90 bg-white/95 px-5 py-3 shadow-xl backdrop-blur ring-1 ring-black/5">
        {/* Left: Hotel & Room Info */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Hotel className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">
              {roomName}{roomCount > 1 ? ` (${roomCount} rooms)` : ''} · <span className="font-normal text-slate-500">{hotelName}</span>
            </p>
          </div>
        </div>

        {/* Center/Right: Timer & Actions */}
        <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
          <div className="scale-90 origin-left sm:origin-center">
            <HoldCountdown expiresAt={hold.expiresAt} onExpire={fetchActiveHold} />
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleResume} className="h-8 px-4 text-xs font-semibold shadow-sm">
              Resume
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancel}
              disabled={cancelling}
              className="h-8 px-2.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              {cancelling ? 'Releasing…' : 'Cancel'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
