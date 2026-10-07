import { adminCustomerService } from '../services/adminCustomer.service.js';

function actorOf(req) {
  return { id: req.user.id, roles: req.user.roles };
}

export const adminCustomerController = {
  async list(req, res) {
    return res.json(await adminCustomerService.list(req.validated.query, actorOf(req)));
  },

  async detail(req, res) {
    return res.json({ customer: await adminCustomerService.detail(req.validated.params.id, actorOf(req)) });
  },
};
