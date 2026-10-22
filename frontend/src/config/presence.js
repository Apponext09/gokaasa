/**
 * Mirrors the backend's defaults in backend/src/config/index.js (PRESENCE_HEARTBEAT_SECONDS /
 * PRESENCE_ONLINE_TIMEOUT_SECONDS / PRESENCE_AWAY_TIMEOUT_SECONDS). Kept as plain constants rather than
 * fetched from the server: presence works the same for every signed-in user regardless of role, so
 * there is nothing per-tenant to configure here.
 */
export const PRESENCE_CONFIG = {
  heartbeatIntervalMs: 30_000,
  onlineTimeoutMs: 90_000,
  awayTimeoutMs: 300_000,
};
