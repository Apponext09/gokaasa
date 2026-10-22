import { presenceStatusFromHeartbeat, PRESENCE_STATUS_META } from '@/features/users/presenceFormat.js';
import { PRESENCE_CONFIG } from '@/config/presence.js';
import { cn } from '@/lib/utils.js';

/** A small colored dot + label derived live from a session's last heartbeat. `now` is passed in so the whole table re-derives together on one ticking interval rather than each cell running its own timer. */
export function PresenceDot({ lastHeartbeatAt, now }) {
  const status = presenceStatusFromHeartbeat(lastHeartbeatAt, now, {
    onlineTimeoutMs: PRESENCE_CONFIG.onlineTimeoutMs,
    awayTimeoutMs: PRESENCE_CONFIG.awayTimeoutMs,
  });
  const meta = PRESENCE_STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text-body)]">
      <span className={cn('h-2 w-2 shrink-0 rounded-full', meta.dotClass)} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
