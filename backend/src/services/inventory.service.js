import { withTransaction, pool } from '../db/pool.js';
import { roomTypeRepository } from '../repositories/roomType.repository.js';
import { inventoryRepository } from '../repositories/inventory.repository.js';
import { ratePlanRepository } from '../repositories/ratePlan.repository.js';
import { auditService } from './audit.service.js';
import { sellableUnits } from '../domain/inventory.js';
import { addDays, daysBetween, nightsBetween, priceComponents, MAX_CALENDAR_DAYS } from '../domain/pricing.js';
import { AppError } from '../utils/AppError.js';

const DEFAULT_HOLD_MINUTES = 15;

/** Keyed lookup of nightly facts: `${roomTypeId}|${date}` -> facts with sellable count. */
export async function loadNightly(client, roomTypeIds, nights) {
  const rows = await inventoryRepository.nightlyFacts(roomTypeIds, nights, client);
  const map = new Map();
  for (const row of rows) {
    const facts = {
      date: row.stay_date,
      totalUnits: row.total_units,
      unitsOverride: row.units_override,
      isClosed: row.is_closed,
      min_stay: row.min_stay,
      max_stay: row.max_stay,
      blocked: row.blocked,
      reserved: row.reserved,
    };
    facts.sellable = sellableUnits(facts);
    map.set(`${row.room_type_id}|${row.stay_date}`, facts);
  }
  return map;
}

function assertRange(from, to) {
  if (!from || !to) throw AppError.badRequest('Provide valid from and to dates (YYYY-MM-DD)');
  if (to < from) throw AppError.unprocessable('The end date must be on or after the start date');
  if (daysBetween(from, to) + 1 > MAX_CALENDAR_DAYS) {
    throw AppError.unprocessable(`Choose at most ${MAX_CALENDAR_DAYS} days at a time`);
  }
}

async function requireRoomType(client, roomTypeId) {
  const room = await roomTypeRepository.lockById(roomTypeId, client);
  if (!room) throw AppError.notFound('Room type not found');
  return room;
}

export const inventoryService = {
  /**
   * Day-by-day view for the rate calendar. Admin-only: it exposes blocked and reserved counts, which the
   * public availability endpoint never reveals.
   */
  async calendar(roomTypeId, { from, to, ratePlanId = null }) {
    assertRange(from, to);
    const room = await roomTypeRepository.findById(roomTypeId);
    if (!room) throw AppError.notFound('Room type not found');

    const nights = nightsBetween(from, addDays(to, 1));
    const [nightly, plans] = await Promise.all([
      loadNightly(pool, [roomTypeId], nights),
      ratePlanRepository.listForRoomType(roomTypeId),
    ]);
    const visiblePlans = ratePlanId ? plans.filter((plan) => plan.id === Number(ratePlanId)) : plans;
    const prices = await ratePlanRepository.pricesInRange(
      visiblePlans.map((plan) => plan.id),
      from,
      addDays(to, 1),
    );

    const priceByKey = new Map(prices.map((row) => [`${row.rate_plan_id}|${row.stay_date}`, row]));
    return {
      roomType: { id: room.id, name: room.name, roomCode: room.room_code, totalUnits: room.total_units, status: room.status },
      from,
      to,
      ratePlans: visiblePlans.map((plan) => ({
        id: plan.id,
        code: plan.code,
        name: plan.name,
        status: plan.status,
        mealPlan: plan.meal_plan,
        isRefundable: plan.is_refundable,
        discountPercent: Number(plan.discount_percent),
        taxPercent: Number(plan.tax_percent),
        feeMinor: plan.fee_minor,
      })),
      days: nights.map((date) => {
        const facts = nightly.get(`${roomTypeId}|${date}`);
        return {
          date,
          totalUnits: facts.totalUnits,
          unitsOverride: facts.unitsOverride,
          isClosed: facts.isClosed,
          minStay: facts.min_stay,
          maxStay: facts.max_stay,
          blocked: facts.blocked,
          reserved: facts.reserved,
          sellable: facts.sellable,
          rates: Object.fromEntries(
            visiblePlans.map((plan) => {
              const row = priceByKey.get(`${plan.id}|${date}`);
              return [
                plan.id,
                row
                  ? {
                    base: row.base_price_minor,
                    discount: row.discount_minor,
                    tax: row.tax_minor,
                    fee: row.fee_minor,
                    final: row.final_price_minor,
                  }
                  : null,
              ];
            }),
          ),
        };
      }),
    };
  },

  /**
   * Applies prices and/or inventory settings to a date range in one transaction. Fields left undefined
   * are not touched. Passing null clears a unit override, min stay or max stay.
   */
  async bulkUpdate(roomTypeId, input, actor) {
    assertRange(input.from, input.to);
    const dates = nightsBetween(input.from, addDays(input.to, 1));

    await withTransaction(async (client) => {
      const room = await requireRoomType(client, roomTypeId);
      if (room.status === 'ARCHIVED') throw AppError.conflict('Archived room types cannot be changed');

      const changes = {};
      if (input.basePriceMinor !== undefined) {
        if (!input.ratePlanId) throw AppError.unprocessable('Choose a rate plan to set a price');
        if (input.basePriceMinor === null) throw AppError.unprocessable('A price cannot be cleared; set a value or leave it unchanged');
        const plan = await ratePlanRepository.findById(input.ratePlanId, client);
        if (!plan || plan.room_type_id !== roomTypeId) throw AppError.unprocessable('That rate plan does not belong to this room type');
        const components = priceComponents({
          baseMinor: input.basePriceMinor,
          discountPercent: plan.discount_percent,
          taxPercent: plan.tax_percent,
          feeMinor: plan.fee_minor,
        });
        await ratePlanRepository.upsertPrices(client, plan.id, dates, components);
        changes.prices = { ratePlanId: plan.id, basePriceMinor: input.basePriceMinor, nights: dates.length };
      }

      const touchesInventory = ['units', 'isClosed', 'minStay', 'maxStay'].some((key) => input[key] !== undefined);
      if (touchesInventory) {
        if (input.minStay != null && input.maxStay != null && input.maxStay < input.minStay) {
          throw AppError.unprocessable('Maximum stay cannot be shorter than minimum stay');
        }
        if (input.units != null && input.units < 0) throw AppError.unprocessable('Units cannot be negative');

        // A unit change must never drop below rooms already blocked or reserved for that night.
        if (input.units !== undefined) {
          const nightly = await loadNightly(client, [roomTypeId], dates);
          for (const date of dates) {
            const facts = nightly.get(`${roomTypeId}|${date}`);
            const newTotal = input.units ?? room.total_units;
            if (newTotal < facts.blocked + facts.reserved) {
              throw AppError.conflict('This change would drop below rooms already reserved or blocked', {
                date,
                reserved: facts.reserved,
                blocked: facts.blocked,
              });
            }
          }
        }

        await inventoryRepository.upsertSettings(client, roomTypeId, dates, {
          units: input.units ?? null,
          isClosed: input.isClosed ?? null,
          minStay: input.minStay ?? null,
          maxStay: input.maxStay ?? null,
          setUnits: input.units !== undefined,
          setClosed: input.isClosed !== undefined,
          setMinStay: input.minStay !== undefined,
          setMaxStay: input.maxStay !== undefined,
        });
        changes.inventory = {
          from: input.from,
          to: input.to,
          units: input.units,
          isClosed: input.isClosed,
          minStay: input.minStay,
          maxStay: input.maxStay,
        };
      }

      await auditService.record(client, {
        actor,
        action: 'room_inventory.bulk_updated',
        entity: 'room_type',
        entityId: roomTypeId,
        newValue: changes,
      });
    });

    return this.calendar(roomTypeId, { from: input.from, to: input.to, ratePlanId: input.ratePlanId ?? null });
  },

  async createBlock(roomTypeId, input, actor) {
    assertRange(input.startDate, addDays(input.endDate, -1));
    if (input.endDate <= input.startDate) throw AppError.unprocessable('The block must cover at least one night');

    return withTransaction(async (client) => {
      const room = await requireRoomType(client, roomTypeId);
      if (room.status === 'ARCHIVED') throw AppError.conflict('Archived room types cannot be blocked');

      const nights = nightsBetween(input.startDate, input.endDate);
      const nightly = await loadNightly(client, [roomTypeId], nights);
      for (const date of nights) {
        const facts = nightly.get(`${roomTypeId}|${date}`);
        if (facts.sellable < input.quantity) {
          throw AppError.conflict('Not enough free rooms on every night of this block', {
            date,
            sellable: facts.sellable,
          });
        }
      }

      const id = await inventoryRepository.insertBlock(client, {
        roomTypeId,
        startDate: input.startDate,
        endDate: input.endDate,
        quantity: input.quantity,
        reason: input.reason,
        note: input.note,
        createdBy: actor.id,
      });
      await auditService.record(client, {
        actor,
        action: 'room_inventory.blocked',
        entity: 'room_type',
        entityId: roomTypeId,
        newValue: { blockId: id, ...input },
      });
      return { id, ...input, roomTypeId };
    });
  },

  async listBlocks(roomTypeId) {
    return (await inventoryRepository.listActiveBlocks(roomTypeId)).map((block) => ({
      id: block.id,
      startDate: block.start_date,
      endDate: block.end_date,
      quantity: block.quantity,
      reason: block.reason,
      note: block.note,
    }));
  },

  async deactivateBlock(blockId, actor) {
    return withTransaction(async (client) => {
      const block = await inventoryRepository.findBlock(blockId, client);
      if (!block || !block.is_active) throw AppError.notFound('Block not found');
      await requireRoomType(client, block.room_type_id);
      await inventoryRepository.deactivateBlock(client, blockId);
      await auditService.record(client, {
        actor,
        action: 'room_inventory.unblocked',
        entity: 'room_type',
        entityId: block.room_type_id,
        oldValue: { blockId },
      });
    });
  },

  /**
   * Places a short hold on `rooms` units for every night of a stay. Must run inside the caller's
   * transaction. The room type row is locked first, so two concurrent reservations for the last rooms
   * are serialised: the second sees the first and fails cleanly instead of overbooking.
   */
  async reserveRooms(client, { roomTypeId, checkIn, checkOut, rooms, holdMinutes = DEFAULT_HOLD_MINUTES, holdId = null }) {
    const room = await requireRoomType(client, roomTypeId);
    if (room.status !== 'ACTIVE') throw AppError.conflict('This room type is not available for booking');

    const nights = nightsBetween(checkIn, checkOut);
    const nightly = await loadNightly(client, [roomTypeId], nights);
    for (const date of nights) {
      const facts = nightly.get(`${roomTypeId}|${date}`);
      if (facts.sellable < rooms) {
        throw AppError.conflict('Not enough rooms left for these dates', { date, available: facts.sellable, requested: rooms });
      }
    }
    for (const date of nights) {
      await inventoryRepository.insertHold(client, { roomTypeId, stayDate: date, quantity: rooms, holdMinutes, holdId });
    }
    return { roomTypeId, nights: nights.length, rooms, holdMinutes, holdId };
  },

  /** Convenience wrapper for callers that do not already hold a transaction. */
  async reserve(args) {
    return withTransaction((client) => this.reserveRooms(client, args));
  },
};
