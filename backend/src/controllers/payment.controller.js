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

  async getPayment(req, res) {
    return res.json(await paymentService.getById(req.user.id, req.validated.params.id));
  },

  async getRefund(req, res) {
    return res.json(await paymentService.getRefundById(req.user.id, req.validated.params.id));
  },

  async devCheckout(req, res) {
    return res.json(await paymentService.devCheckout(req.user.id, req.validated.body));
  },
};
