import { adminBookingService } from '../services/adminBooking.service.js';
import { invoiceService } from '../services/invoice.service.js';

function actorOf(req) {
  return { id: req.user.id, roles: req.user.roles, ip: req.ip };
}

export const adminBookingController = {
  async list(req, res) {
    return res.json(await adminBookingService.list(req.validated.query, actorOf(req)));
  },

  async detail(req, res) {
    return res.json({ booking: await adminBookingService.detail(req.validated.params.id, actorOf(req)) });
  },

  async cancel(req, res) {
    return res.json({ booking: await adminBookingService.cancel(req.validated.params.id, req.validated.body, actorOf(req)) });
  },

  async listPayments(req, res) {
    return res.json(await adminBookingService.listPayments(req.validated.query, actorOf(req)));
  },

  async listRefunds(req, res) {
    return res.json(await adminBookingService.listRefunds(req.validated.query, actorOf(req)));
  },

  async downloadInvoice(req, res) {
    const { filename, buffer } = await invoiceService.forStaff(req.validated.params.id, actorOf(req));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  },
};
