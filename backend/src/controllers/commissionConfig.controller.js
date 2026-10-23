import { commissionService } from '../services/commission.service.js';

function actorOf(req) {
  return { id: req.user.id, roles: req.user.roles, ip: req.ip };
}

export const commissionConfigController = {
  async getGlobal(req, res) {
    return res.json(await commissionService.getGlobalConfig());
  },

  async setGlobal(req, res) {
    return res.json(await commissionService.setGlobalRate(req.validated.body, actorOf(req)));
  },

  async getForHotel(req, res) {
    return res.json(await commissionService.getHotelConfig(req.validated.params.id));
  },

  async setForHotel(req, res) {
    return res.json(await commissionService.setHotelRate(req.validated.params.id, req.validated.body, actorOf(req)));
  },
};
