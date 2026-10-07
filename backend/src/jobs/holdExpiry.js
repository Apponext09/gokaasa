import { holdService } from '../services/hold.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('hold-expiry');

/**
 * Periodic expiry of overdue holds. Reads never depend on this worker: an overdue hold is already treated as
 * expired and its rooms are already free (availability ignores reservations past their expiry). The worker
 * only writes the final status and releases rows, so reports and My Trips stay accurate.
 *
 * It runs in-process for now. The loop is one function call, so it can move to a BullMQ repeatable job
 * without changing the expiry logic itself.
 */
export function startHoldExpiryWorker({ intervalMs = 30_000 } = {}) {
  let running = false;
  const tick = async () => {
    if (running) return; // never overlap two passes in one process
    running = true;
    try {
      const expired = await holdService.expireDueHolds({ limit: 100 });
      if (expired > 0) log.info('expired holds', { count: expired });
    } catch (error) {
      log.error('expiry pass failed', { message: error.message });
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
