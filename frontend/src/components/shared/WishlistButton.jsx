import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { discoveryApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { cn } from '@/lib/utils.js';

/**
 * Saves a hotel to the signed-in customer's wishlist. Guests can keep browsing; saving asks them to sign in
 * and returns them to the same page afterwards. Changes are optimistic and roll back if the server refuses.
 */
export function WishlistButton({ hotelId, initial = false, hotelName, variant = 'button' }) {
  const { status } = useAuth();
  const location = useLocation();
  const [saved, setSaved] = useState(Boolean(initial));
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState(false);

  useEffect(() => {
    setSaved(Boolean(initial));
  }, [initial]);

  const toggle = async (event) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (status !== 'authenticated') {
      setPrompt(true);
      return;
    }
    const next = !saved;
    setSaved(next);
    setBusy(true);
    try {
      if (next) await discoveryApi.addWishlist(hotelId);
      else await discoveryApi.removeWishlist(hotelId);
      toast.success(next ? `Saved ${hotelName ?? 'hotel'}` : 'Removed from saved hotels');
    } catch (error) {
      setSaved(!next);
      toast.error(normalizeError(error).message);
    } finally {
      setBusy(false);
    }
  };

  const label = saved ? 'Remove from saved hotels' : 'Save hotel';

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={saved}
        aria-label={label}
        title={label}
        className={cn(
          'transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-60',
          variant === 'chip'
            ? 'grid h-9 w-9 place-items-center rounded-full bg-white/95 text-[var(--text-body)] shadow-sm hover:text-danger-600'
            : 'inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-subtle)] px-4 text-sm font-medium hover:bg-[var(--surface-muted)]',
        )}
      >
        <Heart className={cn('h-4 w-4', saved && 'fill-danger-600 text-danger-600')} aria-hidden="true" />
        {variant === 'button' && (saved ? 'Saved' : 'Save')}
      </button>

      <Modal open={prompt} title="Sign in to save hotels" onClose={() => setPrompt(false)}>
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-muted)]">
            Create a free account or sign in to keep a list of hotels you like. You can keep browsing without an account.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Link to="/register" state={{ from: location.pathname + location.search }} onClick={() => setPrompt(false)}>
              <Button variant="secondary" className="w-full">Create account</Button>
            </Link>
            <Link to="/login" state={{ from: location.pathname + location.search }} onClick={() => setPrompt(false)}>
              <Button className="w-full">Sign in</Button>
            </Link>
          </div>
        </div>
      </Modal>
    </>
  );
}
