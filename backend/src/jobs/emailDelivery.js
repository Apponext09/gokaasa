import { emailNotificationService } from '../services/emailNotification.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('email-delivery-worker');

export function startEmailDeliveryWorker({ intervalMs }) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await emailNotificationService.recover();
    } catch (error) {
      log.error('email delivery sweep failed', { message: error.message });
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}

