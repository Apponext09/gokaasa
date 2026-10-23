import { partnerApplicationService } from '../services/partnerApplication.service.js';
import { getPrivateStorage } from '../storage/privateStorage.js';
import { requestMeta, sendSession } from './sessionCookie.js';

function actorOf(req) {
  return { id: req.user.id, roles: req.user.roles, ip: req.ip };
}

export async function streamDocument(doc, res) {
  const buffer = await getPrivateStorage().read(doc.storage_key);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('Cache-Control', 'private, no-store');
  res.type(doc.mime_type);
  return res.send(buffer);
}

/** Self-service endpoints a HOTEL_OWNER applicant uses before (and while) their application is reviewed. */
export const partnerController = {
  async register(req, res) {
    const result = await partnerApplicationService.register(req.validated.body);
    return res.status(201).json(result);
  },

  async resendOtp(req, res) {
    await partnerApplicationService.resendOtp(req.validated.body.email);
    return res.status(202).json({ message: 'If that email is pending verification, a new code has been sent.' });
  },

  async verifyOtp(req, res) {
    const session = await partnerApplicationService.verifyOtp(req.validated.body, requestMeta(req));
    return sendSession(res, 200, session);
  },

  async uploadDocument(req, res) {
    const document = await partnerApplicationService.uploadDocument(req.user.id, req.file, req.validated.body, actorOf(req));
    return res.status(201).json({ document });
  },

  async getApplication(req, res) {
    return res.json({ application: await partnerApplicationService.getMyApplication(req.user.id) });
  },

  async submit(req, res) {
    return res.json({ application: await partnerApplicationService.submit(req.user.id, actorOf(req)) });
  },

  async getDocumentFile(req, res) {
    return streamDocument(req.partnerDocument, res);
  },
};
