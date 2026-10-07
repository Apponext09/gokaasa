import { createLogger } from '../utils/logger.js';

const log = createLogger('import-queue');

/**
 * Small in-process job queue. Jobs are persisted in `hotel_import_jobs` before they are queued, so a
 * restart never loses work (see `resumePending`). The interface is intentionally tiny so it can be
 * swapped for BullMQ/Redis without touching the import service.
 */
export class ImportQueue {
  /**
   * @param {{ concurrency: number, handler: (jobId: number) => Promise<void> }} options
   */
  constructor({ concurrency, handler }) {
    this.concurrency = concurrency;
    this.handler = handler;
    this.pending = [];
    this.queued = new Set();
    this.running = 0;
  }

  enqueue(jobId, delayMs = 0) {
    const schedule = () => {
      if (this.queued.has(jobId)) return;
      this.queued.add(jobId);
      this.pending.push(jobId);
      this.pump();
    };
    if (delayMs > 0) {
      setTimeout(schedule, delayMs).unref();
    } else {
      schedule();
    }
  }

  pump() {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const jobId = this.pending.shift();
      this.running += 1;
      this.handler(jobId)
        .catch((error) => log.error('job handler crashed', { jobId, message: error.message }))
        .finally(() => {
          this.running -= 1;
          this.queued.delete(jobId);
          this.pump();
        });
    }
  }
}
