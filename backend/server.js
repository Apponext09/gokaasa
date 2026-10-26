import { createApp } from './src/app.js';
import { config } from './src/config/index.js';
import { pool } from './src/db/pool.js';
import { ImportQueue } from './src/jobs/importQueue.js';
import { hotelImportService, setImportQueue } from './src/services/hotelImport.service.js';
import { getActiveProviders } from './src/providers/index.js';
import { hotelImportRepository } from './src/repositories/hotelImport.repository.js';
import { createLogger } from './src/utils/logger.js';
import { startHoldExpiryWorker } from './src/jobs/holdExpiry.js';
import { startPresenceCleanupWorker } from './src/jobs/presenceCleanup.js';
import { startEmailDeliveryWorker } from './src/jobs/emailDelivery.js';

const log = createLogger('server');

async function start() {
  await pool.query('SELECT 1');

  const queue = new ImportQueue({
    concurrency: config.hotelImport.concurrency,
    handler: (jobId) => hotelImportService.processJob(jobId),
  });
  setImportQueue(queue);

  for (const provider of getActiveProviders()) {
    await hotelImportRepository.upsertSource({ provider: provider.code, displayName: provider.displayName });
  }
  await hotelImportService.resumeInterruptedJobs();

  const app = createApp();
  const server = app.listen(config.port, () => {
    log.info('api listening', {
      port: config.port,
      env: config.env,
      providers: getActiveProviders().map((provider) => provider.code),
    });
  });

  const expiryWorker = startHoldExpiryWorker({ intervalMs: 30_000 });
  const presenceCleanupWorker = startPresenceCleanupWorker({
    intervalMs: config.presence.cleanupIntervalMs,
    expireMinutes: config.presence.sessionExpireMinutes,
  });
  const emailDeliveryWorker = startEmailDeliveryWorker({ intervalMs: config.mail.retryIntervalMs });

  const shutdown = (signal) => {
    log.info('shutting down', { signal });
    expiryWorker.stop();
    presenceCleanupWorker.stop();
    emailDeliveryWorker.stop();
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error) => {
  log.error('failed to start', { message: error.message });
  process.exit(1);
});
