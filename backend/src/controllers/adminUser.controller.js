import { adminUserService } from '../services/adminUser.service.js';
import { streamTicketService } from '../services/streamTicket.service.js';
import { presenceEvents, PRESENCE_SESSION_ENDED, PRESENCE_SESSION_UPDATED } from '../services/presenceEvents.js';
import { AppError } from '../utils/AppError.js';

function actorOf(req) {
  return { id: req.user.id, roles: req.user.roles, permissions: req.user.permissions, ip: req.ip };
}

export const adminUserController = {
  async createStaff(req, res) {
    const user = await adminUserService.createStaff(req.validated.body, actorOf(req));
    return res.status(201).json({ user });
  },

  async list(req, res) {
    return res.json(await adminUserService.list(req.validated.query));
  },

  async detail(req, res) {
    return res.json({ user: await adminUserService.detail(req.validated.params.id) });
  },

  async kpis(req, res) {
    return res.json(await adminUserService.kpis());
  },

  async setStatus(req, res) {
    const user = await adminUserService.setStatus(req.validated.params.id, req.validated.body.isActive, actorOf(req));
    return res.json({ user });
  },

  async forceSignOut(req, res) {
    return res.json(await adminUserService.forceSignOut(req.validated.params.id, actorOf(req)));
  },

  async revokeSession(req, res) {
    return res.json(await adminUserService.revokeSession(req.validated.params.id, req.validated.params.sessionId, actorOf(req)));
  },

  /** Mints a one-time ticket the client immediately uses to open the SSE stream below. */
  async issueStreamTicket(req, res) {
    return res.json(streamTicketService.issue(actorOf(req)));
  },

  /**
   * EventSource can't send an Authorization header, so this route sits outside the router's normal
   * `staff` bearer-auth gate (see admin.routes.js) and authorizes via the one-time ticket instead.
   */
  async stream(req, res) {
    const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : '';
    const identity = streamTicketService.consume(ticket);
    if (!identity) throw AppError.unauthorized('This live connection has expired. Reconnecting…');
    if (!identity.permissions.includes('user.manage')) throw AppError.forbidden();

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send('connected', { ok: true });

    const onUpdated = (payload) => send('session:updated', payload);
    const onEnded = (payload) => send('session:ended', payload);
    presenceEvents.on(PRESENCE_SESSION_UPDATED, onUpdated);
    presenceEvents.on(PRESENCE_SESSION_ENDED, onEnded);

    // Keeps intermediary proxies from closing an idle connection, and lets the client detect a dead link.
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 20_000);

    req.on('close', () => {
      clearInterval(keepAlive);
      presenceEvents.off(PRESENCE_SESSION_UPDATED, onUpdated);
      presenceEvents.off(PRESENCE_SESSION_ENDED, onEnded);
    });
  },
};
