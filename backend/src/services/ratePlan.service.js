import { withTransaction } from '../db/pool.js';
import { hotelRepository } from '../repositories/hotel.repository.js';
import { roomTypeRepository } from '../repositories/roomType.repository.js';
import { ratePlanRepository } from '../repositories/ratePlan.repository.js';
import { cancellationPolicyRepository } from '../repositories/cancellationPolicy.repository.js';
import { auditService } from './audit.service.js';
import { priceComponents } from '../domain/pricing.js';
import { AppError } from '../utils/AppError.js';
import { toRatePlanDto } from './roomType.service.js';

/** A refundable rate may not point at a non-refundable policy, and a non-refundable rate needs one. */
async function checkRefundability(client, { hotelId, isRefundable, cancellationPolicyId }) {
  if (cancellationPolicyId == null) {
    if (!isRefundable) throw AppError.unprocessable('A non-refundable rate needs a non-refundable cancellation policy');
    return null;
  }
  const policy = await cancellationPolicyRepository.findById(cancellationPolicyId, client);
  if (!policy || policy.hotel_id !== hotelId) {
    throw AppError.unprocessable('Choose a cancellation policy from this hotel', [{ field: 'cancellationPolicyId', message: 'Unknown policy' }]);
  }
  if (!isRefundable && !policy.is_non_refundable) {
    throw AppError.unprocessable('A non-refundable rate needs a non-refundable cancellation policy', [
      { field: 'cancellationPolicyId', message: 'Choose a non-refundable policy' },
    ]);
  }
  if (isRefundable && policy.is_non_refundable) {
    throw AppError.unprocessable('A refundable rate cannot use a non-refundable policy', [
      { field: 'isRefundable', message: 'Mark the rate non-refundable or choose another policy' },
    ]);
  }
  return policy;
}

async function loadPlanWithPolicy(planId, client) {
  const plan = await ratePlanRepository.findById(planId, client);
  if (!plan) return null;
  const policy = plan.cancellation_policy_id ? await cancellationPolicyRepository.findById(plan.cancellation_policy_id, client) : null;
  return toRatePlanDto(plan, policy);
}

export const ratePlanService = {
  async listForRoomType(roomTypeId) {
    const plans = await ratePlanRepository.listForRoomType(roomTypeId);
    const policies = await cancellationPolicyRepository.listForHotel((await roomTypeRepository.findById(roomTypeId))?.hotel_id ?? 0);
    const byId = new Map(policies.map((policy) => [policy.id, policy]));
    return plans.map((plan) => toRatePlanDto(plan, byId.get(plan.cancellation_policy_id) ?? null));
  },

  async create(roomTypeId, input, actor) {
    const planId = await withTransaction(async (client) => {
      const room = await roomTypeRepository.lockById(roomTypeId, client);
      if (!room) throw AppError.notFound('Room type not found');
      if (room.status === 'ARCHIVED') throw AppError.conflict('Archived room types cannot be priced');
      const hotel = await hotelRepository.findById(room.hotel_id, { client });
      if (hotel.status === 'ARCHIVED') throw AppError.conflict('Archived hotels are read-only');

      if (await ratePlanRepository.existsCode(roomTypeId, input.code, null, client)) {
        throw AppError.conflict('This room already has a rate plan with that code', { field: 'code' });
      }
      await checkRefundability(client, { hotelId: room.hotel_id, ...input });

      const id = await ratePlanRepository.insert(client, {
        hotel_id: room.hotel_id,
        room_type_id: roomTypeId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        meal_plan: input.mealPlan,
        is_refundable: input.isRefundable,
        cancellation_policy_id: input.cancellationPolicyId ?? null,
        discount_percent: input.discountPercent,
        tax_percent: input.taxPercent,
        fee_minor: input.feeMinor,
        status: input.status ?? 'ACTIVE',
      });
      await auditService.record(client, {
        actor,
        action: 'rate_plan.created',
        entity: 'rate_plan',
        entityId: id,
        newValue: { roomTypeId, code: input.code, mealPlan: input.mealPlan, isRefundable: input.isRefundable },
      });
      return id;
    });
    return loadPlanWithPolicy(planId);
  },

  /**
   * Changing discount, tax or fee recomputes the stored components of every existing night, so the stored
   * prices always agree with the plan.
   */
  async update(planId, input, actor) {
    await withTransaction(async (client) => {
      const current = await ratePlanRepository.findById(planId, client);
      if (!current) throw AppError.notFound('Rate plan not found');
      const room = await roomTypeRepository.lockById(current.room_type_id, client);
      if (!room) throw AppError.notFound('Room type not found');
      if (room.status === 'ARCHIVED') throw AppError.conflict('Archived room types cannot be priced');

      if (input.code && input.code !== current.code && (await ratePlanRepository.existsCode(current.room_type_id, input.code, planId, client))) {
        throw AppError.conflict('This room already has a rate plan with that code', { field: 'code' });
      }

      const nextRefundable = input.isRefundable ?? current.is_refundable;
      const nextPolicyId = input.cancellationPolicyId !== undefined ? input.cancellationPolicyId : current.cancellation_policy_id;
      await checkRefundability(client, { hotelId: current.hotel_id, isRefundable: nextRefundable, cancellationPolicyId: nextPolicyId });

      const changes = {};
      const map = {
        code: 'code',
        name: 'name',
        description: 'description',
        mealPlan: 'meal_plan',
        isRefundable: 'is_refundable',
        cancellationPolicyId: 'cancellation_policy_id',
        discountPercent: 'discount_percent',
        taxPercent: 'tax_percent',
        feeMinor: 'fee_minor',
        status: 'status',
      };
      for (const [key, column] of Object.entries(map)) {
        if (input[key] !== undefined) changes[column] = input[key];
      }
      await ratePlanRepository.update(client, planId, changes);

      const pricingChanged = ['discount_percent', 'tax_percent', 'fee_minor'].some(
        (column) => changes[column] !== undefined && Number(changes[column]) !== Number(current[column]),
      );
      if (pricingChanged) {
        const updated = await ratePlanRepository.findById(planId, client);
        for (const night of await ratePlanRepository.allPricesForPlan(planId, client)) {
          const components = priceComponents({
            baseMinor: Number(night.base_price_minor),
            discountPercent: updated.discount_percent,
            taxPercent: updated.tax_percent,
            feeMinor: updated.fee_minor,
          });
          await ratePlanRepository.setPriceComponents(client, planId, night.stay_date, components);
        }
      }

      await auditService.record(client, {
        actor,
        action: 'rate_plan.updated',
        entity: 'rate_plan',
        entityId: planId,
        oldValue: Object.fromEntries(Object.keys(changes).map((column) => [column, current[column]])),
        newValue: changes,
      });
    });
    return loadPlanWithPolicy(planId);
  },
};
