import { holdService } from '../services/hold.service.js';
import { bookingService } from '../services/booking.service.js';
import { invoiceService } from '../services/invoice.service.js';
import { couponService } from '../services/coupon.service.js';

/** Customer booking flow: holds, guest details, bookings, My Trips and cancellation. Every call is owner-scoped. */
export const bookingController = {
  async createHold(req, res) {
    return res.status(201).json({ hold: await holdService.create(req.user.id, req.validated.body) });
  },

  async activeHold(req, res) {
    return res.json({ hold: await holdService.active(req.user.id) });
  },

  async getHold(req, res) {
    return res.json({ hold: await holdService.get(req.user.id, req.validated.params.id) });
  },

  async saveGuests(req, res) {
    return res.json({ hold: await holdService.saveGuests(req.user.id, req.validated.params.id, req.validated.body) });
  },

  async requote(req, res) {
    return res.json(await holdService.requote(req.user.id, req.validated.params.id));
  },

  async releaseHold(req, res) {
    return res.json({ hold: await holdService.release(req.user.id, req.validated.params.id) });
  },

  async listHoldCoupons(req, res) {
    return res.json({ items: await couponService.applicableForHold(req.user.id, req.validated.params.id) });
  },

  async applyCoupon(req, res) {
    await couponService.applyToHold(req.user.id, req.validated.params.id, req.validated.body.code);
    return res.json({ hold: await holdService.get(req.user.id, req.validated.params.id) });
  },

  async removeCoupon(req, res) {
    await couponService.removeFromHold(req.user.id, req.validated.params.id);
    return res.json({ hold: await holdService.get(req.user.id, req.validated.params.id) });
  },

  async getBooking(req, res) {
    return res.json({ booking: await bookingService.details(req.user.id, req.validated.params.id) });
  },

  async cancellationPreview(req, res) {
    return res.json({ preview: await bookingService.cancellationPreview(req.user.id, req.validated.params.id) });
  },

  async cancelBooking(req, res) {
    return res.json({ booking: await bookingService.cancel(req.user.id, req.validated.params.id, req.validated.body) });
  },

  async listMyBookings(req, res) {
    return res.json(await bookingService.list(req.user.id, req.validated.query.tab));
  },

  async downloadInvoice(req, res) {
    const { filename, buffer } = await invoiceService.forOwner(req.user.id, req.validated.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  },
};
