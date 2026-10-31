import { managerService } from '../services/manager.service.js';

function actorOf(req) {
  return { id: req.user.id, roles: req.user.roles, ip: req.ip };
}

export const managerController = {
  async listOnboardingForHotel(req, res) {
    return res.json({ executives: await managerService.listOnboardingForHotel(req.validated.params.id) });
  },

  async listOnboardingExecutives(_req, res) {
    return res.json({ executives: await managerService.listOnboardingExecutives() });
  },

  async assignOnboarding(req, res) {
    return res.status(201).json({ executives: await managerService.assignOnboarding(req.validated.params.id, req.validated.body.userId, actorOf(req)) });
  },

  async unassignOnboarding(req, res) {
    return res.json({ executives: await managerService.unassignOnboarding(req.validated.params.id, req.validated.params.userId, actorOf(req)) });
  },

};
