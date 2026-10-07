import { pool, withTransaction } from '../db/pool.js';
import { hotelRepository } from '../repositories/hotel.repository.js';
import { auditService } from './audit.service.js';
import { notificationService } from '../notifications/notificationService.js';
import { AppError } from '../utils/AppError.js';

export const managerService = {
  async listForHotel(hotelId) {
    const { rows } = await pool.query(
      `SELECT u.id, u.email::text AS email, u.first_name, u.last_name, hm.assigned_at
         FROM hotel_managers hm JOIN users u ON u.id = hm.user_id
        WHERE hm.hotel_id = $1
        ORDER BY hm.assigned_at DESC`,
      [hotelId],
    );
    return rows.map((row) => ({ userId: row.id, email: row.email, firstName: row.first_name, lastName: row.last_name, assignedAt: row.assigned_at }));
  },

  async assign(hotelId, userId, actor) {
    const hotel = await hotelRepository.findById(hotelId, {});
    if (!hotel) throw AppError.notFound('Hotel not found');

    const { rows } = await pool.query(
      `SELECT u.id, r.code FROM users u
        JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId],
    );
    if (rows.length === 0) throw AppError.notFound('User not found');
    if (!rows.some((row) => row.code === 'HOTEL_MANAGER')) {
      throw AppError.unprocessable('Only a user with the Hotel Manager role can be assigned to a hotel');
    }

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO hotel_managers (user_id, hotel_id, assigned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [userId, hotelId, actor.id],
      );
      await auditService.record(client, {
        actor,
        action: 'hotel.manager_assigned',
        entity: 'hotel',
        entityId: hotelId,
        newValue: { userId },
      });
    });
    notificationService.sendManagerAssigned(userId, hotel).catch(() => {});
    return this.listForHotel(hotelId);
  },

  async unassign(hotelId, userId, actor) {
    await withTransaction(async (client) => {
      await client.query(`DELETE FROM hotel_managers WHERE hotel_id = $1 AND user_id = $2`, [hotelId, userId]);
      await auditService.record(client, {
        actor,
        action: 'hotel.manager_unassigned',
        entity: 'hotel',
        entityId: hotelId,
        oldValue: { userId },
      });
    });
    return this.listForHotel(hotelId);
  },

  /** Every HOTEL_MANAGER account, for the assignment picker. */
  async listManagers(query) {
    const params = ['HOTEL_MANAGER'];
    let where = `r.code = $1`;
    if (query.q) {
      params.push(`%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      where += ` AND (u.email ILIKE $${params.length} OR u.first_name ILIKE $${params.length} OR u.last_name ILIKE $${params.length})`;
    }
    const { rows } = await pool.query(
      `SELECT DISTINCT u.id, u.email::text AS email, u.first_name, u.last_name
         FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
        WHERE ${where} AND u.deleted_at IS NULL
        ORDER BY u.first_name, u.last_name`,
      params,
    );
    return rows.map((row) => ({ id: row.id, email: row.email, firstName: row.first_name, lastName: row.last_name }));
  },
};
