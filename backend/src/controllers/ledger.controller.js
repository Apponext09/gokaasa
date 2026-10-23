import { ledgerService } from '../services/ledger.service.js';

function actorOf(req) {
  return { id: req.user.id, roles: req.user.roles };
}

export const ledgerController = {
  async summary(req, res) {
    return res.json(await ledgerService.summaryForActor(actorOf(req), req.validated.query));
  },

  async entries(req, res) {
    return res.json(await ledgerService.entriesForActor(actorOf(req), req.validated.query));
  },

  async bookingDetail(req, res) {
    return res.json(await ledgerService.bookingDetailForActor(actorOf(req), req.validated.params.bookingId));
  },
};
