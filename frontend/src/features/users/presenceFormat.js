/** Pure formatting/derivation helpers for the admin User Management presence table. No side effects, no DOM. */

/** Buckets a session's last heartbeat into 'online' | 'away' | 'offline'. Mirrors backend/src/services/adminUser.service.js#presenceStatus so the table and the drawer never disagree. */
export function presenceStatusFromHeartbeat(lastHeartbeatAt, nowMs, { onlineTimeoutMs, awayTimeoutMs }) {
  if (!lastHeartbeatAt) return 'offline';
  const ageMs = nowMs - new Date(lastHeartbeatAt).getTime();
  if (ageMs <= onlineTimeoutMs) return 'online';
  if (ageMs <= awayTimeoutMs) return 'away';
  return 'offline';
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "Just now" / "3 minutes ago" / "2 hours ago" / "Yesterday" / a plain date beyond that. */
export function relativeTimeLabel(value, nowMs = Date.now()) {
  if (!value) return 'Not available';
  const diff = nowMs - new Date(value).getTime();
  if (diff < 0 || diff < 45_000) return 'Just now';
  if (diff < HOUR) {
    const minutes = Math.round(diff / MINUTE);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (diff < DAY) {
    const hours = Math.round(diff / HOUR);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (diff < 2 * DAY) return 'Yesterday';
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Whether a route change should trigger an immediate heartbeat (vs waiting for the next scheduled
 * tick). Keeps rapid in-app navigation from firing a burst of requests: an immediate send only happens
 * if at least half the heartbeat interval has passed since the last one actually sent.
 */
export function shouldSendImmediateHeartbeat(nowMs, lastSentAtMs, heartbeatIntervalMs) {
  if (!lastSentAtMs) return true;
  return nowMs - lastSentAtMs >= heartbeatIntervalMs / 2;
}

export const PRESENCE_STATUS_META = {
  online: { label: 'Online', dotClass: 'bg-success-500' },
  away: { label: 'Away', dotClass: 'bg-warning-500' },
  offline: { label: 'Offline', dotClass: 'bg-[var(--text-muted)]' },
};
