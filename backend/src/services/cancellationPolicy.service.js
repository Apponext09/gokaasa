import { withTransaction } from '../db/pool.js';
import { hotelRepository } from '../repositories/hotel.repository.js';
import { cancellationPolicyRepository } from '../repositories/cancellationPolicy.repository.js';
import { auditService } from './audit.service.js';
import { AppError } from '../utils/AppError.js';
import { toPolicyDto } from './roomType.service.js';

// Standard policies every hotel starts with. Each is ordinary data, so admins can edit or retire them.
const DEFAULT_POLICIES = [
  { code: 'FREE_CANCELLATION', name: 'Free cancellation', description: 'Cancel for a full refund up to 24 hours before check-in.', isNonRefundable: false, cancellationDeadlineHours: 24, refundPercent: 100 },
  { code: 'PARTIAL_REFUND', name: 'Partial refund', description: 'Cancel up to 48 hours before check-in for a 50% refund.', isNonRefundable: false, cancellationDeadlineHours: 48, refundPercent: 50 },
  { code: 'NON_REFUNDABLE', name: 'Non-refundable', description: 'No refund once booked.', isNonRefundable: true, cancellationDeadlineHours: null, refundPercent: 0 },
];

function toColumns(input) {
  return {
    code: input.code,
    name: input.name,
    description: input.description ?? null,
    is_non_refundable: input.isNonRefundable,
    cancellation_deadline_hours: input.cancellationDeadlineHours ?? null,
    refund_percent: input.refundPercent,
    status: input.status ?? 'ACTIVE',
  };
}

async function requireHotel(hotelId, client) {
  const hotel = await hotelRepository.findById(hotelId, { client });
  if (!hotel) throw AppError.notFound('Hotel not found');
  if (hotel.status === 'ARCHIVED') throw AppError.conflict('Archived hotels are read-only');
  return hotel;
}

export const cancellationPolicyService = {
  /** Lists the hotel's policies. A hotel with none gets the standard set, written in the same transaction. */
  async listForHotel(hotelId, actor) {
    const policies = await withTransaction(async (client) => {
      await requireHotel(hotelId, client);
      let rows = await cancellationPolicyRepository.listForHotel(hotelId, client);
      if (rows.length === 0 && actor) {
        for (const policy of DEFAULT_POLICIES) {
          await cancellationPolicyRepository.insert(client, { hotel_id: hotelId, ...toColumns(policy) });
        }
        await auditService.record(client, {
          actor,
          action: 'cancellation_policy.defaults_created',
          entity: 'hotel',
          entityId: hotelId,
          newValue: { codes: DEFAULT_POLICIES.map((policy) => policy.code) },
        });
        rows = await cancellationPolicyRepository.listForHotel(hotelId, client);
      }
      return rows;
    });
    return policies.map(toPolicyDto);
  },

  async create(hotelId, input, actor) {
    const id = await withTransaction(async (client) => {
      await requireHotel(hotelId, client);
      if (await cancellationPolicyRepository.existsCode(hotelId, input.code, null, client)) {
        throw AppError.conflict('This hotel already has a policy with that code', { field: 'code' });
      }
      const id = await cancellationPolicyRepository.insert(client, { hotel_id: hotelId, ...toColumns(input) });
      await auditService.record(client, {
        actor,
        action: 'cancellation_policy.created',
        entity: 'hotel',
        entityId: hotelId,
        newValue: { policyId: id, code: input.code },
      });
      return id;
    });
    return toPolicyDto(await cancellationPolicyRepository.findById(id));
  },

  async update(policyId, input, actor) {
    await withTransaction(async (client) => {
      const current = await cancellationPolicyRepository.findById(policyId, client);
      if (!current) throw AppError.notFound('Cancellation policy not found');
      await requireHotel(current.hotel_id, client);
      if (input.code && input.code !== current.code && (await cancellationPolicyRepository.existsCode(current.hotel_id, input.code, policyId, client))) {
        throw AppError.conflict('This hotel already has a policy with that code', { field: 'code' });
      }
      const merged = {
        code: input.code ?? current.code,
        name: input.name ?? current.name,
        description: input.description !== undefined ? input.description : current.description,
        isNonRefundable: input.isNonRefundable ?? current.is_non_refundable,
        cancellationDeadlineHours: input.cancellationDeadlineHours !== undefined ? input.cancellationDeadlineHours : current.cancellation_deadline_hours,
        refundPercent: input.refundPercent ?? current.refund_percent,
        status: input.status ?? current.status,
      };
      const changes = toColumns(merged);
      const oldValue = {};
      const newValue = {};
      for (const [column, value] of Object.entries(changes)) {
        if (String(current[column] ?? '') !== String(value ?? '')) {
          oldValue[column] = current[column] ?? null;
          newValue[column] = value ?? null;
        }
      }
      if (Object.keys(newValue).length > 0) {
        await cancellationPolicyRepository.update(client, policyId, changes);
        await auditService.record(client, {
          actor,
          action: 'cancellation_policy.updated',
          entity: 'hotel',
          entityId: current.hotel_id,
          oldValue,
          newValue,
        });
      }
    });
    return toPolicyDto(await cancellationPolicyRepository.findById(policyId));
  },

  /** A policy still used by a rate or room cannot be archived; guests on those rates need its terms. */
  async archive(policyId, actor) {
    await withTransaction(async (client) => {
      const current = await cancellationPolicyRepository.findById(policyId, client);
      if (!current) throw AppError.notFound('Cancellation policy not found');
      if ((await cancellationPolicyRepository.usageCount(policyId, client)) > 0) {
        throw AppError.conflict('This policy is used by rates or rooms. Switch them to another policy first.');
      }
      await client.query(`UPDATE cancellation_policies SET deleted_at = now(), updated_at = now() WHERE id = $1`, [policyId]);
      await auditService.record(client, {
        actor,
        action: 'cancellation_policy.archived',
        entity: 'hotel',
        entityId: current.hotel_id,
        oldValue: { policyId, code: current.code },
      });
    });
  },
};
