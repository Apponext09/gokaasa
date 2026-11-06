import { auditRepository } from '../repositories/audit.repository.js';
import { toPage } from './presenters.js';

function toRow(row) {
  return {
    id: row.id,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    actor: row.first_name ? { name: [row.first_name, row.last_name].filter(Boolean).join(' '), email: row.email, roles: row.actor_roles ?? [] } : null,
    oldValue: row.old_value,
    newValue: row.new_value,
    ipAddress: row.ip_address,
    createdAt: row.created_at,
  };
}

export const auditLogService = {
  /** ADMIN only (enforced at the route) — it can reveal other staff members' actions across every hotel. */
  async list(query) {
    const { rows, total } = await auditRepository.list(query);
    return toPage(rows.map(toRow), total, query.page, query.limit);
  },

  /** A single hotel's full activity timeline, across hotel/room-type/rate-plan edits. ADMIN only (route-enforced). */
  async listForHotel(hotelId, query) {
    const { rows, total } = await auditRepository.listForHotel(hotelId, query);
    return toPage(rows.map(toRow), total, query.page, query.limit);
  },
};
