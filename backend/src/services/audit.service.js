import { auditRepository } from '../repositories/audit.repository.js';

/**
 * Records an admin action. Pass the transaction client when the audit row must commit or roll back
 * together with the change it describes.
 */
export const auditService = {
  async record(client, { actor, action, entity, entityId, oldValue, newValue }) {
    await auditRepository.insert(client, {
      userId: actor?.id,
      action,
      entity,
      entityId,
      oldValue,
      newValue,
      ipAddress: actor?.ip,
    });
  },
};
