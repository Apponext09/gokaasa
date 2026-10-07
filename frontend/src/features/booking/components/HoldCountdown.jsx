import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { formatCountdown } from '../bookingFormat.js';

/**
 * Visual countdown for a room hold. It is a convenience only: the server decides when a hold ends. When the
 * timer reaches zero, `onExpire` asks the page to re-read the hold from the server, which is the source of truth.
 */
export function HoldCountdown({ expiresAt, onExpire }) {
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);
  const remaining = Math.ceil((new Date(expiresAt).getTime() - now) / 1000);

  useEffect(() => {
    firedRef.current = false;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  useEffect(() => {
    if (remaining <= 0 && !firedRef.current) {
      firedRef.current = true;
      onExpire?.();
    }
  }, [remaining, onExpire]);

  const urgent = remaining <= 120;
  return (
    <p
      className={`flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm ${urgent ? 'bg-warning-50 text-warning-600' : 'bg-[var(--surface-muted)] text-[var(--text-body)]'}`}
      aria-live="off"
    >
      <Clock className="h-4 w-4" aria-hidden="true" />
      Rooms held for <span className="font-semibold tabular-nums">{formatCountdown(remaining)}</span>
    </p>
  );
}
