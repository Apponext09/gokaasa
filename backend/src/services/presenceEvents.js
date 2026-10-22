import { EventEmitter } from 'node:events';

/**
 * In-process pub/sub between presence writes and admin SSE connections. There is no cross-process
 * fan-out (no Redis) -- fine for a single API process; a future multi-instance deployment would need
 * to swap this for a shared bus without changing either side's call shape.
 */
export const presenceEvents = new EventEmitter();
presenceEvents.setMaxListeners(100);

export const PRESENCE_SESSION_UPDATED = 'session:updated';
export const PRESENCE_SESSION_ENDED = 'session:ended';
