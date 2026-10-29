import { hotelReviewService } from '../services/hotelReview.service.js';

const actorOf = (req) => ({ id: req.user.id, roles: req.user.roles, ip: req.ip });

export const hotelReviewController = {
  async list(req, res) { return res.json(await hotelReviewService.list(req.validated.query, actorOf(req))); },
  async detail(req, res) { return res.json(await hotelReviewService.getForHotel(req.validated.params.id, actorOf(req))); },
  async assign(req, res) { return res.json({ review: await hotelReviewService.assign(req.validated.params.id, req.validated.body.reviewerId, actorOf(req)) }); },
  async addIssue(req, res) { return res.status(201).json({ review: await hotelReviewService.addIssue(req.validated.params.id, req.validated.body, actorOf(req)) }); },
  async fixIssue(req, res) { return res.json({ review: await hotelReviewService.updateIssue(req.validated.params.id, req.validated.params.issueId, 'FIX', actorOf(req)) }); },
  async verifyIssue(req, res) { return res.json({ review: await hotelReviewService.updateIssue(req.validated.params.id, req.validated.params.issueId, 'VERIFY', actorOf(req)) }); },
  async reopenIssue(req, res) { return res.json({ review: await hotelReviewService.updateIssue(req.validated.params.id, req.validated.params.issueId, 'REOPEN', actorOf(req)) }); },
  async requestChanges(req, res) { return res.json({ review: await hotelReviewService.requestChanges(req.validated.params.id, req.validated.body.summary, actorOf(req)) }); },
  async approve(req, res) { return res.json({ review: await hotelReviewService.approve(req.validated.params.id, req.validated.body.summary, actorOf(req)) }); },
  async approveAndPublish(req, res) { return res.json({ review: await hotelReviewService.approve(req.validated.params.id, req.validated.body.summary, actorOf(req), { publish: true }) }); },
  async reviewers(_req, res) { return res.json({ reviewers: await hotelReviewService.listReviewers() }); },
};

