import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { formatMoney } from '@/components/shared/index.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { bookingApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Shows the room the guest chose. It stays on screen across navigation (see booking/selection.js). Continue asks the
 * server to hold the rooms; the browser sends only the choice, and the server prices and reserves it.
 */
export function SelectionBar({ selection, onClear }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { status } = useAuth();
  const [starting, setStarting] = useState(false);

  if (!selection) return null;

  const onContinue = async () => {
    if (status !== 'authenticated') {
      navigate('/login', { state: { from: location.pathname + location.search } });
      return;
    }
    setStarting(true);
    try {
      const hold = await bookingApi.createHold({
        hotelId: selection.hotelId,
        roomTypeId: selection.roomTypeId,
        ratePlanId: selection.ratePlanId,
        checkIn: selection.checkIn,
        checkOut: selection.checkOut,
        rooms: selection.rooms,
        occupancy: selection.occupancy,
        idempotencyKey: selection.idempotencyKey,
      });
      navigate(`/booking/guest-details?holdId=${hold.id}`);
    } catch (err) {
      const normalized = normalizeError(err);
      toast.error(normalized.status === 409 ? `This room just became unavailable. ${normalized.message}` : normalized.message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div role="region" aria-label="Your selection" className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border-subtle)] bg-[var(--surface-card)]/97 shadow-lg backdrop-blur md:left-0">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0 text-sm">
          <p className="truncate font-semibold text-[var(--text-strong)]">
            {selection.roomName} · {selection.ratePlanName}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            {shortDate(selection.checkIn)} → {shortDate(selection.checkOut)} · {selection.rooms} room{selection.rooms === 1 ? '' : 's'} · {selection.nights} night{selection.nights === 1 ? '' : 's'} · total{' '}
            <span className="font-semibold text-[var(--text-body)]">{formatMoney(selection.finalAmountMinor)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClear} aria-label="Clear selected room" disabled={starting}>
            <X className="h-4 w-4" aria-hidden="true" /> Clear
          </Button>
          <Button onClick={onContinue} disabled={starting}>
            {starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {starting ? 'Holding your room…' : 'Continue'}
            {!starting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
