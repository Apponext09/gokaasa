import { pool, withTransaction } from '../db/pool.js';
import { hotelRepository } from '../repositories/hotel.repository.js';
import { auditService } from './audit.service.js';
import { AppError } from '../utils/AppError.js';

export const managerService = {
  async listOnboardingForHotel(hotelId) {
    const { rows } = await pool.query(
      `SELECT u.id, u.email::text AS email, u.first_name, u.last_name, hoa.assigned_at
         FROM hotel_onboarding_assignments hoa JOIN users u ON u.id = hoa.user_id
        WHERE hoa.hotel_id = $1 ORDER BY hoa.assigned_at DESC`,
      [hotelId],
    );
    return rows.map((row) => ({ userId: row.id, email: row.email, firstName: row.first_name, lastName: row.last_name, assignedAt: row.assigned_at }));
  },

  async listOnboardingExecutives() {
    const { rows } = await pool.query(
      `SELECT u.id, u.email::text AS email, u.first_name, u.last_name
         FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
        WHERE r.code = 'HOTEL_ONBOARDING_EXECUTIVE' AND u.is_active AND u.deleted_at IS NULL
        ORDER BY u.first_name, u.last_name, u.id`,
    );
    return rows.map((row) => ({ id: row.id, email: row.email, firstName: row.first_name, lastName: row.last_name }));
  },

  async assignOnboarding(hotelId, userId, actor) {
    const hotel = await hotelRepository.findById(hotelId, {});
    if (!hotel) throw AppError.notFound('Hotel not found');
    const { rowCount } = await pool.query(
      `SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
        WHERE u.id = $1 AND u.is_active AND u.deleted_at IS NULL AND r.code = 'HOTEL_ONBOARDING_EXECUTIVE'`,
      [userId],
    );
    if (!rowCount) throw AppError.unprocessable('Only an active hotel onboarding executive can be assigned');
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO hotel_onboarding_assignments (user_id, hotel_id, assigned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [userId, hotelId, actor.id],
      );
      await auditService.record(client, { actor, action: 'hotel.onboarding_executive_assigned', entity: 'hotel', entityId: hotelId, newValue: { userId } });
    });
    return this.listOnboardingForHotel(hotelId);
  },

  async unassignOnboarding(hotelId, userId, actor) {
    await withTransaction(async (client) => {
      await client.query(`DELETE FROM hotel_onboarding_assignments WHERE hotel_id = $1 AND user_id = $2`, [hotelId, userId]);
      await auditService.record(client, { actor, action: 'hotel.onboarding_executive_unassigned', entity: 'hotel', entityId: hotelId, oldValue: { userId } });
    });
    return this.listOnboardingForHotel(hotelId);
  },
};
