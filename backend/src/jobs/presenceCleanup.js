import { presenceRepository } from '../repositories/presence.repository.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('presence-cleanup');

/**
 * Closes presence sessions that stopped heartbeating a while ago. Online/offline status itself never
 * depends on this sweep -- it is derived live from `last_heartbeat_at` on every read -- so this job only
 * bounds how long a dead session keeps showing up as "active" (e.g. a closed laptop lid) in the admin
 * sessions list. Same in-process setInterval shape as holdExpiry.js.
 */
export function startPresenceCleanupWorker({ intervalMs = 300_000, expireMinutes = 60 } = {}) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const closed = await presenceRepository.cleanupStale(expireMinutes);
      if (closed > 0) log.info('closed stale sessions', { count: closed });
    } catch (error) {
      log.error('cleanup pass failed', { message: error.message });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return {
    tick,
    stop: () => clearInterval(timer),
  };
}
