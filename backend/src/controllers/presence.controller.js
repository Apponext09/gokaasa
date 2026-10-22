import { presenceService } from '../services/presence.service.js';

export const presenceController = {
  async start(req, res) {
    const result = await presenceService.startSession(req.user.id, {
      platform: req.validated.body.platform,
      route: req.validated.body.route,
      userAgent: req.get('user-agent'),
    });
    return res.status(201).json({ session: result });
  },

  async heartbeat(req, res) {
    const result = await presenceService.heartbeat(req.user.id, req.validated.body.sessionId, { route: req.validated.body.route });
    return res.json(result);
  },

  async end(req, res) {
    const result = await presenceService.endSession(req.user.id, req.validated.body.sessionId);
    return res.json(result);
  },
};
