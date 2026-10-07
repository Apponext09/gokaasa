import { paymentService } from '../services/payment.service.js';

export const paymentController = {
  async config(_req, res) {
    return res.json(paymentService.publicConfig());
  },

  async createOrder(req, res) {
    return res.status(201).json(await paymentService.createOrder(req.user.id, req.validated.body.holdId));
  },

  async verify(req, res) {
    return res.json(await paymentService.verify(req.user.id, req.validated.body));
  },

  async reportFailure(req, res) {
    return res.json(await paymentService.reportFailure(req.user.id, req.validated.body));
  },

  async devCheckout(req, res) {
    return res.json(await paymentService.devCheckout(req.user.id, req.validated.body));
  },

  /**
   * Provider webhook. Mounted in app.js with a raw body parser, because the signature covers the exact bytes
   * sent. It is not behind authentication: the signature is the authentication.
   */
  async webhook(req, res) {
    const result = await paymentService.webhook(req.body, req.get('x-razorpay-signature'), req.get('x-razorpay-event-id'));
    return res.json({ received: true, ...result });
  },
};
