import { catalogService } from '../services/catalog.service.js';

const actorOf = (req) => ({ id: req.user.id, roles: req.user.roles, ip: req.ip });

export const catalogController = {
  async publicList(req, res) {
    return res.json({ items: await catalogService.list(req.validated.params.kind, { activeOnly: true }) });
  },
  async adminList(req, res) {
    return res.json({ items: await catalogService.list(req.validated.params.kind) });
  },
  async create(req, res) {
    return res.status(201).json({ item: await catalogService.create(req.validated.params.kind, req.validated.body, actorOf(req)) });
  },
  async update(req, res) {
    return res.json({ item: await catalogService.update(req.validated.params.kind, req.validated.params.code, req.validated.body, actorOf(req)) });
  },
};

