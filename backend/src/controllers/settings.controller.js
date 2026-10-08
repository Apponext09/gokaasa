import { settingsService } from '../services/settings.service.js';

function actorOf(req) {
  return { id: req.user.id, roles: req.user.roles, ip: req.ip };
}

export const settingsController = {
  async get(req, res) {
    return res.json(await settingsService.get());
  },

  async update(req, res) {
    return res.json(await settingsService.update(req.validated.body, actorOf(req)));
  },
};
