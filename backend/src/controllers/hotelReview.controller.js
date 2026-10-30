import { hotelReviewService } from '../services/hotelReview.service.js';

const actorOf = (req) => ({ id: req.user.id, roles: req.user.roles, ip: req.ip });

export const hotelReviewController = {
  async list(req, res) { return res.json(await hotelReviewService.list(req.validated.query, actorOf(req))); },
  async detail(req, res) { return res.json(await hotelReviewService.getForHotel(req.validated.params.id, actorOf(req))); },
  async requestChanges(req, res) { return res.json({ review: await hotelReviewService.requestChanges(req.validated.params.id, req.validated.body.summary, actorOf(req)) }); },
  async approve(req, res) { return res.json({ review: await hotelReviewService.approve(req.validated.params.id, req.validated.body.summary, actorOf(req)) }); },
};

