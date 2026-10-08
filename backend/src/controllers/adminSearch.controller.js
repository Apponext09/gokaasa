import { adminSearchService } from '../services/adminSearch.service.js';

function actorOf(req) {
  return { id: req.user.id, roles: req.user.roles };
}

export const adminSearchController = {
  async search(req, res) {
    return res.json(await adminSearchService.search(req.validated.query.q, actorOf(req)));
  },
};
