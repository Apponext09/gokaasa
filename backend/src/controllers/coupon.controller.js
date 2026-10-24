import { couponService } from '../services/coupon.service.js';
import { AppError } from '../utils/AppError.js';

function actorOf(req) {
  return { id: req.user.id, roles: req.user.roles };
}

/** ADMIN-only coupon management (every route is gated with authorize('ADMIN') in admin.routes.js). */
export const couponController = {
  async list(req, res) {
    return res.json(await couponService.list(req.validated.query));
  },

  async detail(req, res) {
    return res.json({ coupon: await couponService.detail(req.validated.params.id) });
  },

  async create(req, res) {
    return res.status(201).json({ coupon: await couponService.create(req.validated.body, actorOf(req)) });
  },

  async update(req, res) {
    return res.json({ coupon: await couponService.update(req.validated.params.id, req.validated.body, actorOf(req)) });
  },

  async setStatus(req, res) {
    return res.json({ coupon: await couponService.setActive(req.validated.params.id, req.validated.body.isActive, actorOf(req)) });
  },

  async uploadImage(req, res) {
    if (!req.file) throw AppError.badRequest('Choose an image to upload');
    return res.status(201).json({ coupon: await couponService.uploadImage(req.validated.params.id, req.file, actorOf(req)) });
  },

  async remove(req, res) {
    await couponService.remove(req.validated.params.id, actorOf(req));
    return res.status(204).end();
  },
};
