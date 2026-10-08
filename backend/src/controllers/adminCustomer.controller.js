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

  async exportCsv(req, res) {
    const csv = await adminCustomerService.exportCustomers(req.validated.query, actorOf(req));
    return sendCsv(res, 'customers.csv', csv);
  },
};
