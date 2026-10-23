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
    this.stopped = false;
    // Pending delayed (retry) timers, so shutdown can cancel them instead of waiting them out or
    // letting them fire after the caller believes the queue is idle.
    this.timers = new Set();
    this.idleWaiters = [];
  }

  enqueue(jobId, delayMs = 0) {
    if (this.stopped) return;
    const schedule = () => {
      if (this.queued.has(jobId)) return;
      this.queued.add(jobId);
      this.pending.push(jobId);
      this.pump();
    };
    if (delayMs > 0) {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        if (!this.stopped) schedule();
      }, delayMs).unref();
      this.timers.add(timer);
    } else {
      schedule();
    }
  }

  pump() {
    if (this.stopped) return;
    while (this.running < this.concurrency && this.pending.length > 0) {
      const jobId = this.pending.shift();
      this.running += 1;
      this.handler(jobId)
        .catch((error) => log.error('job handler crashed', { jobId, message: error.message }))
        .finally(() => {
          this.running -= 1;
          this.queued.delete(jobId);
          this.pump();
          this.notifyIfIdle();
        });
    }
    this.notifyIfIdle();
  }

  isIdle() {
    return this.running === 0 && this.pending.length === 0;
  }

  notifyIfIdle() {
    if (!this.isIdle()) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  /**
   * Resolves once every job this queue has already accepted has fully finished running its handler
   * (including any trailing work inside it) -- not merely "left PENDING/PROCESSING in the database".
   * A caller that needs to close a resource the handler depends on (e.g. a shared DB pool) must await
   * this first. Resolves immediately if nothing is in flight. Does not wait for jobs enqueued after
   * this call.
   */
  onIdle({ timeoutMs = 10_000 } = {}) {
    if (this.isIdle()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.idleWaiters.indexOf(settle);
        if (index !== -1) this.idleWaiters.splice(index, 1);
        reject(new Error(`ImportQueue did not go idle within ${timeoutMs}ms (running=${this.running}, pending=${this.pending.length})`));
      }, timeoutMs);
      const settle = () => {
        clearTimeout(timer);
        resolve();
      };
      this.idleWaiters.push(settle);
    });
  }

  /**
   * Stops accepting new work, cancels pending retry timers (so a delayed retry can never fire after
   * shutdown), and waits for whatever is already running to finish. Safe to call more than once.
   */
  async stop({ timeoutMs = 10_000 } = {}) {
    this.stopped = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.pending.length = 0;
    this.queued.clear();
    await this.onIdle({ timeoutMs });
  }
}
