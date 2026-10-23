import { partnerApplicationService } from '../services/partnerApplication.service.js';
import { partnerDocumentRepository } from '../repositories/partnerDocument.repository.js';
import { streamDocument } from './partner.controller.js';
import { AppError } from '../utils/AppError.js';

function actorOf(req) {
  return { id: req.user.id, roles: req.user.roles, ip: req.ip };
}

/** ADMIN-only partner-application review queue (routes are already gated by authorize('ADMIN')). */
export const partnerReviewController = {
  async list(req, res) {
    return res.json(await partnerApplicationService.listForAdmin(req.validated.query));
  },

  async detail(req, res) {
    return res.json({ application: await partnerApplicationService.getForAdmin(req.validated.params.userId) });
  },

  async approve(req, res) {
    return res.json({ application: await partnerApplicationService.approve(req.validated.params.userId, actorOf(req)) });
  },

  async reject(req, res) {
    return res.json({ application: await partnerApplicationService.reject(req.validated.params.userId, req.validated.body.reason, actorOf(req)) });
  },

  async getDocumentFile(req, res) {
    const doc = await partnerDocumentRepository.findById(req.validated.params.docId);
    if (!doc || doc.user_id !== req.validated.params.userId) throw AppError.notFound('Document not found');
    return streamDocument(doc, res);
  },
};
