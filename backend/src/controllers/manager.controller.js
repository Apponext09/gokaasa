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

  async detail(req, res) {
    return res.json({ manager: await managerService.detail(req.validated.params.userId) });
  },
};
