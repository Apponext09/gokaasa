import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { formatMoney } from '@/components/shared/index.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { GuestContactModal } from '@/features/booking/GuestContactModal.jsx';
import { bookingApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Shows the room the guest chose. It stays on screen across navigation (see booking/selection.js). Continue asks the
 * server to hold the rooms; the browser sends only the choice, and the server prices and reserves it.
 */
export function SelectionBar({ selection, onClear }) {
  const navigate = useNavigate();
  const { status } = useAuth();
  const [starting, setStarting] = useState(false);
  const [guestModalOpen, setGuestModalOpen] = useState(false);

  if (!selection) return null;

  const startHold = async () => {
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
      const nextParams = new URLSearchParams({ holdId: String(hold.id) });
      if (selection.coupon) nextParams.set('coupon', selection.coupon);
      navigate(`/booking/guest-details?${nextParams}`);
    } catch (err) {
      const normalized = normalizeError(err);
      toast.error(normalized.status === 409 ? `This room just became unavailable. ${normalized.message}` : normalized.message);
    } finally {
      setStarting(false);
    }
  };

  // Feature 2: no login redirect. An unauthenticated visitor gets a quick contact form instead, then
  // proceeds through the exact same hold-creation call as an already-signed-in customer.
  const onContinue = () => {
    if (status !== 'authenticated') {
      setGuestModalOpen(true);
      return;
    }
    startHold();
  };

  return (
    <>
      <GuestContactModal
        open={guestModalOpen}
        onClose={() => setGuestModalOpen(false)}
        onContinue={() => {
          setGuestModalOpen(false);
          startHold();
        }}
      />
      <div role="region" aria-label="Your selection" className="selection-bar fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border-subtle)] bg-[var(--surface-card)]/97 shadow-lg backdrop-blur md:left-0 md:right-[var(--assistant-dock-offset,0px)]">
        <div className="selection-bar-inner mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="selection-bar-copy min-w-0 text-sm">
            <p className="truncate font-semibold text-[var(--text-strong)]">
              {selection.roomName} · {selection.ratePlanName}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              {shortDate(selection.checkIn)} → {shortDate(selection.checkOut)} · {selection.rooms} room{selection.rooms === 1 ? '' : 's'} · {selection.nights} night{selection.nights === 1 ? '' : 's'} · total{' '}
              <span className="font-semibold text-[var(--text-body)]">{formatMoney(selection.finalAmountMinor)}</span>
            </p>
          </div>
          <div className="selection-bar-actions flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClear} aria-label="Clear selected room" disabled={starting}>
              <X className="h-4 w-4" aria-hidden="true" /> <span>Clear</span>
            </Button>
            <Button onClick={onContinue} disabled={starting}>
              {starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {starting ? 'Holding your room…' : 'Continue'}
              {!starting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
