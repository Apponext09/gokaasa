import { auditLogService } from '../services/auditLog.service.js';

export const auditLogController = {
  async list(req, res) {
    return res.json(await auditLogService.list(req.validated.query));
  },
};
