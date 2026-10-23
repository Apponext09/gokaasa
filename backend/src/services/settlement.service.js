import { withTransaction } from '../db/pool.js';
import { hotelRepository } from '../repositories/hotel.repository.js';
import { settlementRepository } from '../repositories/settlement.repository.js';
import { ledgerEntryRepository } from '../repositories/ledgerEntry.repository.js';
import { LEDGER_ENTRY_TYPE, LEDGER_DIRECTION, netForHotel } from '../domain/ledgerEntry.js';
import { SETTLEMENT_ACTION, resolveTransition } from '../domain/settlementStatus.js';
import { auditService } from './audit.service.js';
import { toPage } from './presenters.js';
import { AppError } from '../utils/AppError.js';

/** Same scoping rule as ledger.service.js: null = ADMIN (unscoped), an out-of-scope id scopes to nothing. */
async function resolveScopedHotelIds(actor, requestedHotelId) {
  if (actor.roles.includes('ADMIN')) {
    return requestedHotelId ? [requestedHotelId] : null;
  }
  const managed = await hotelRepository.managedHotelIds(actor.id);
  if (requestedHotelId) {
    return managed.includes(requestedHotelId) ? [requestedHotelId] : [];
  }
  return managed;
}

async function detail(settlementId) {
  const settlement = await settlementRepository.findById(settlementId);
  if (!settlement) throw AppError.notFound('Settlement not found');
  const lineItems = await settlementRepository.lineItemsForSettlement(settlementId);
  return { ...settlement, lineItems };
}

async function loadScoped(actor, settlementId) {
  const settlement = await settlementRepository.findById(settlementId);
  if (!settlement) throw AppError.notFound('Settlement not found');
  if (!actor.roles.includes('ADMIN')) {
    const managed = await hotelRepository.managedHotelIds(actor.id);
    if (!managed.includes(settlement.hotelId)) throw AppError.notFound('Settlement not found');
  }
  return settlement;
}

export const settlementService = {
  /**
   * Claims every currently-unclaimed ledger entry for one hotel, locks it, sums it, and creates a DRAFT
   * settlement. The claim (`settlement_id` set, permanently) happens in the SAME transaction as the sum
   * it's based on, under `FOR UPDATE SKIP LOCKED` -- two concurrent calls for the same hotel split the
   * available rows rather than racing on the same ones. A negative or zero balance is not settled; it
   * simply carries forward and nets against this hotel's next positive earnings (documented policy).
   */
  async createDraft({ hotelId }, actor) {
    const hotel = await hotelRepository.findById(hotelId);
    if (!hotel) throw AppError.notFound('Hotel not found');

    const { settlementId } = await withTransaction(async (client) => {
      const entries = await ledgerEntryRepository.lockUnclaimedForHotel(client, hotelId);
      if (entries.length === 0) throw AppError.conflict('There is nothing available to settle for this hotel');

      const totalMinor = netForHotel(entries);
      if (totalMinor <= 0) throw AppError.conflict('This hotel has no positive earnings available to settle right now');

      const currency = entries[0].currency;
      const newSettlementId = await settlementRepository.insert(client, { hotelId, currency, totalMinor, createdBy: actor.id });
      await ledgerEntryRepository.claimForSettlement(client, entries.map((entry) => entry.id), newSettlementId);

      const [debitEntryId] = await ledgerEntryRepository.insertMany(client, [{
        hotelId, settlementId: newSettlementId, entryType: LEDGER_ENTRY_TYPE.SETTLEMENT_DEBIT, direction: LEDGER_DIRECTION.DEBIT,
        amountMinor: totalMinor, currency, idempotencyKey: `settlement-debit:${newSettlementId}`,
        description: `Settlement #${newSettlementId} debit`,
      }]);

      await settlementRepository.insertLineItems(
        client, newSettlementId,
        [...entries.map((entry) => ({ id: entry.id, amountMinor: entry.amountMinor })), { id: debitEntryId, amountMinor: totalMinor }],
      );
      await auditService.record(client, {
        actor, action: 'settlement.created', entity: 'settlement', entityId: newSettlementId, newValue: { hotelId, totalMinor },
      });
      return { settlementId: newSettlementId };
    });

    return detail(settlementId);
  },

  async approve(settlementId, actor) {
    await withTransaction(async (client) => {
      const settlement = await settlementRepository.lock(settlementId, client);
      if (!settlement) throw AppError.notFound('Settlement not found');
      const next = resolveTransition(settlement.status, SETTLEMENT_ACTION.APPROVE);
      if (!next) throw AppError.conflict(`Cannot approve a settlement that is ${settlement.status.toLowerCase()}`);
      await settlementRepository.setStatus(client, settlementId, next, { approved_by: actor.id, approved_at: new Date() });
      await auditService.record(client, { actor, action: 'settlement.approved', entity: 'settlement', entityId: settlementId });
    });
    return detail(settlementId);
  },

  async markPaid(settlementId, { payoutReference }, actor) {
    await withTransaction(async (client) => {
      const settlement = await settlementRepository.lock(settlementId, client);
      if (!settlement) throw AppError.notFound('Settlement not found');
      const next = resolveTransition(settlement.status, SETTLEMENT_ACTION.MARK_PAID);
      if (!next) throw AppError.conflict(`Cannot mark paid a settlement that is ${settlement.status.toLowerCase()}`);
      await settlementRepository.setStatus(client, settlementId, next, { paid_at: new Date(), payout_reference: payoutReference });
      await auditService.record(client, {
        actor, action: 'settlement.paid', entity: 'settlement', entityId: settlementId, newValue: { payoutReference },
      });
    });
    return detail(settlementId);
  },

  /** Never touches the originally-claimed entries -- inserts one new, unclaimed credit that becomes available for a future settlement. */
  async reverse(settlementId, { reason }, actor) {
    await withTransaction(async (client) => {
      const settlement = await settlementRepository.lock(settlementId, client);
      if (!settlement) throw AppError.notFound('Settlement not found');
      const next = resolveTransition(settlement.status, SETTLEMENT_ACTION.REVERSE);
      if (!next) throw AppError.conflict(`Cannot reverse a settlement that is ${settlement.status.toLowerCase()}`);

      await ledgerEntryRepository.insertMany(client, [{
        hotelId: settlement.hotelId, entryType: LEDGER_ENTRY_TYPE.SETTLEMENT_REVERSAL, direction: LEDGER_DIRECTION.CREDIT,
        amountMinor: settlement.totalMinor, currency: settlement.currency,
        idempotencyKey: `settlement-reversal:${settlementId}`, description: `Reversal of settlement #${settlementId}: ${reason}`,
      }]);
      await settlementRepository.setStatus(client, settlementId, next, { reversed_at: new Date() });
      await auditService.record(client, {
        actor, action: 'settlement.reversed', entity: 'settlement', entityId: settlementId, newValue: { reason },
      });
    });
    return detail(settlementId);
  },

  async listForActor(actor, { hotelId, status, page, limit }) {
    const hotelIds = await resolveScopedHotelIds(actor, hotelId);
    if (hotelIds !== null && hotelIds.length === 0) return toPage([], 0, page, limit);
    const { total, rows } = await settlementRepository.list({ page, limit, status }, hotelIds);
    return toPage(rows, total, page, limit);
  },

  async detailForActor(actor, settlementId) {
    await loadScoped(actor, settlementId);
    return detail(settlementId);
  },
};
