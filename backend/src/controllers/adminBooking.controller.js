import { adminBookingService } from '../services/adminBooking.service.js';
import { invoiceService } from '../services/invoice.service.js';
import { sendCsv } from '../utils/csv.js';

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

  async exportBookingsCsv(req, res) {
    return sendCsv(res, 'bookings.csv', await adminBookingService.exportBookings(req.validated.query, actorOf(req)));
  },

  async exportPaymentsCsv(req, res) {
    return sendCsv(res, 'payments.csv', await adminBookingService.exportPayments(req.validated.query, actorOf(req)));
  },

  async exportRefundsCsv(req, res) {
    return sendCsv(res, 'refunds.csv', await adminBookingService.exportRefunds(req.validated.query, actorOf(req)));
  },
};
