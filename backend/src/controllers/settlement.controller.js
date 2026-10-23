import { settlementService } from '../services/settlement.service.js';

function actorOf(req) {
  return { id: req.user.id, roles: req.user.roles, ip: req.ip };
}

export const settlementController = {
  async list(req, res) {
    return res.json(await settlementService.listForActor(actorOf(req), req.validated.query));
  },

  async detail(req, res) {
    return res.json(await settlementService.detailForActor(actorOf(req), req.validated.params.id));
  },

  async create(req, res) {
    return res.status(201).json(await settlementService.createDraft(req.validated.body, actorOf(req)));
  },

  async approve(req, res) {
    return res.json(await settlementService.approve(req.validated.params.id, actorOf(req)));
  },

  async markPaid(req, res) {
    return res.json(await settlementService.markPaid(req.validated.params.id, req.validated.body, actorOf(req)));
  },

  async reverse(req, res) {
    return res.json(await settlementService.reverse(req.validated.params.id, req.validated.body, actorOf(req)));
  },
};
