import { managerService } from '../services/manager.service.js';

function actorOf(req) {
  return { id: req.user.id, roles: req.user.roles, ip: req.ip };
}

export const managerController = {
  async listForHotel(req, res) {
    return res.json({ managers: await managerService.listForHotel(req.validated.params.id) });
  },

  async assign(req, res) {
    return res.status(201).json({ managers: await managerService.assign(req.validated.params.id, req.validated.body.userId, actorOf(req)) });
  },

  async unassign(req, res) {
    return res.json({ managers: await managerService.unassign(req.validated.params.id, req.validated.params.userId, actorOf(req)) });
  },

  async listManagers(req, res) {
    return res.json({ managers: await managerService.listManagers(req.validated.query) });
  },
};
