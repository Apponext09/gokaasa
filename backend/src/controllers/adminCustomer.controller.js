import { adminCustomerService } from '../services/adminCustomer.service.js';
import { sendCsv } from '../utils/csv.js';

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

  async setStatus(req, res) {
    const customer = await adminCustomerService.setStatus(req.validated.params.id, req.validated.body.isActive, actorOf(req));
    return res.json({ customer });
  },

  async exportCsv(req, res) {
    const csv = await adminCustomerService.exportCustomers(req.validated.query, actorOf(req));
    return sendCsv(res, 'customers.csv', csv);
  },
};
