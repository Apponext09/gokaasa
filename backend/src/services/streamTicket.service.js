import crypto from 'node:crypto';

/**
 * Short-lived, single-use tickets for authorizing the admin SSE stream. EventSource cannot send an
 * Authorization header, and a real access token must never sit in a URL (server logs, browser history,
 * referrer headers). An authenticated POST mints a ticket tied to the caller's identity; the stream
 * connection consumes it once and the ticket is gone, so there is no reusable credential in the URL.
 */
const TICKET_TTL_MS = 30_000;
const tickets = new Map();

function sweep() {
  const now = Date.now();
  for (const [ticket, entry] of tickets) {
    if (entry.expiresAt < now) tickets.delete(ticket);
  }
}

export const streamTicketService = {
  issue(actor) {
    sweep();
    const ticket = crypto.randomBytes(24).toString('base64url');
    tickets.set(ticket, { userId: actor.id, roles: actor.roles, expiresAt: Date.now() + TICKET_TTL_MS });
    return { ticket, expiresInMs: TICKET_TTL_MS };
  },

  /** Consumes the ticket -- a second attempt with the same value always fails. */
  consume(ticket) {
    const entry = tickets.get(ticket);
    if (!entry) return null;
    tickets.delete(ticket);
    if (entry.expiresAt < Date.now()) return null;
    return { userId: entry.userId, roles: entry.roles };
  },
};
