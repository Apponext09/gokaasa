import { partnerProfileRepository } from '../repositories/partnerProfile.repository.js';
import { partnerDocumentRepository } from '../repositories/partnerDocument.repository.js';
import { AppError } from '../utils/AppError.js';

/**
 * Gates every /api/admin/* route for a HOTEL_OWNER: only an APPROVED partner may reach any of them
 * (hotel creation included), not merely have them hidden client-side. A no-op for every other role --
 * ADMIN and internal staff roles are unaffected.
 */
export async function requirePartnerApproved(req, _res, next) {
  try {
    if (!req.user.roles.includes('HOTEL_OWNER')) return next();
    const status = await partnerProfileRepository.statusForUser(req.user.id);
    if (status !== 'APPROVED') return next(AppError.forbidden('Your partner application is not yet approved'));
    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * A verification document is sensitive (ID, business registration, lease). ADMIN may read any
 * document; everyone else only their own -- a document belonging to someone else looks exactly like
 * one that does not exist, the same "hide, don't reveal" pattern used for hotel access.
 */
export async function requireOwnDocumentOrAdmin(req, _res, next) {
  try {
    const doc = await partnerDocumentRepository.findById(req.validated.params.docId);
    if (!doc) return next(AppError.notFound('Document not found'));
    if (!req.user.roles.includes('ADMIN') && doc.user_id !== req.user.id) {
      return next(AppError.notFound('Document not found'));
    }
    req.partnerDocument = doc;
    return next();
  } catch (error) {
    return next(error);
  }
}
