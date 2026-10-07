import { withTransaction } from '../db/pool.js';
import { hotelRepository } from '../repositories/hotel.repository.js';
import { fieldProvenanceRepository } from '../repositories/fieldProvenance.repository.js';
import { auditService } from './audit.service.js';
import { hotelService } from './hotel.service.js';
import { getActiveProvider } from '../providers/index.js';
import { ProviderError } from '../providers/hotelDataProvider.js';
import { normalizeHotel, rawFieldValues } from '../normalizers/hotelNormalizer.js';
import {
  COLUMN_FOR,
  SOURCE,
  TRACKED_FIELDS,
  canonical,
  importSourceFor,
  isEmptyValue,
  isProtected,
  sameValue,
} from '../domain/fieldProvenance.js';
import { AppError } from '../utils/AppError.js';

const NUMERIC_FIELDS = new Set(['starRating', 'latitude', 'longitude']);

/** Turns a stored text suggestion back into the type the hotel column expects. */
function coerceForField(field, text) {
  if (NUMERIC_FIELDS.has(field)) return Number(text);
  return text;
}

async function requireProviderHotel(hotelId) {
  const hotel = await hotelRepository.findById(hotelId);
  if (!hotel) throw AppError.notFound('Hotel not found');
  if (!hotel.external_provider) throw AppError.unprocessable('This hotel was not imported from a provider');
  if (hotel.status === 'ARCHIVED') throw AppError.conflict('Archived hotels cannot be synced');
  return hotel;
}

export const hotelSyncService = {
  /**
   * Re-reads the provider record and reconciles it with the hotel. Rules:
   *  - Unchanged fields that Gokaasa has not touched are updated to the new provider value.
   *  - Fields an admin modified, verified, or whose history is unknown are NEVER overwritten.
   *    Their new provider value is stored as a suggestion for the admin to accept or dismiss.
   *  - An empty provider value never erases Gokaasa data.
   */
  async syncFromProvider(hotelId, actor) {
    const hotel = await requireProviderHotel(hotelId);
    const provider = getActiveProvider(hotel.external_provider);
    if (!provider) throw AppError.serviceUnavailable('This data source is not currently available');

    let raw;
    try {
      raw = await provider.getDetails(hotel.external_id);
    } catch (error) {
      if (error instanceof ProviderError) throw new AppError(502, 'PROVIDER_ERROR', error.message);
      throw error;
    }

    const normalized = normalizeHotel(raw).hotel;
    const rawValues = rawFieldValues(raw);
    const summary = { applied: [], suggested: [], unchanged: [] };

    await withTransaction(async (client) => {
      const current = await hotelRepository.findById(hotelId, { client });
      const provenance = await fieldProvenanceRepository.listForHotel(hotelId, client);

      for (const field of TRACKED_FIELDS) {
        const column = COLUMN_FOR[field];
        const incoming = normalized[field] ?? null;
        const currentValue = current[column];

        if (isEmptyValue(incoming) || sameValue(incoming, currentValue)) {
          if (sameValue(incoming, currentValue)) await fieldProvenanceRepository.clearSuggestion(client, hotelId, field);
          summary.unchanged.push(field);
          continue;
        }

        if (isProtected(provenance[field])) {
          // Unknown history is treated as edited. Record the suggestion but do not touch the value.
          await fieldProvenanceRepository.upsertSuggestion(client, hotelId, field, canonical(incoming));
          summary.suggested.push({ field, current: currentValue ?? null, incoming });
          continue;
        }

        await hotelRepository.update(client, hotelId, { [column]: incoming, updated_by: actor.id });
        await fieldProvenanceRepository.upsertSource(client, hotelId, field, {
          source: importSourceFor(rawValues[field], incoming),
          externalValue: canonical(incoming),
        });
        summary.applied.push({ field, from: currentValue ?? null, to: incoming });
      }

      await auditService.record(client, {
        actor,
        action: 'hotel.synced_from_provider',
        entity: 'hotel',
        entityId: hotelId,
        newValue: {
          applied: summary.applied.map((item) => item.field),
          suggested: summary.suggested.map((item) => item.field),
        },
      });
    });

    return { ...summary, hotel: await hotelService.getAdmin(hotelId) };
  },

  /** Admin accepts the stored provider suggestion for one field. The field becomes EXTERNAL/NORMALIZED again. */
  async acceptSuggestion(hotelId, field, actor) {
    const hotel = await requireProviderHotel(hotelId);
    await withTransaction(async (client) => {
      const provenance = await fieldProvenanceRepository.listForHotel(hotelId, client);
      const suggestion = provenance[field]?.pending_external_value;
      if (suggestion == null) throw AppError.conflict('There is no provider suggestion for this field');

      const oldValue = hotel[COLUMN_FOR[field]];
      const value = coerceForField(field, suggestion);
      await hotelRepository.update(client, hotelId, { [COLUMN_FOR[field]]: value, updated_by: actor.id });
      await fieldProvenanceRepository.upsertSource(client, hotelId, field, {
        source: SOURCE.NORMALIZED,
        externalValue: suggestion,
      });
      await auditService.record(client, {
        actor,
        action: 'hotel.provider_suggestion_accepted',
        entity: 'hotel',
        entityId: hotelId,
        oldValue: { [field]: oldValue ?? null },
        newValue: { [field]: value },
      });
    });
    // Read after commit so the response reflects the change.
    return hotelService.getAdmin(hotelId);
  },

  /** Admin keeps their value. The suggestion is cleared, and the field stays protected. */
  async dismissSuggestion(hotelId, field, actor) {
    await requireProviderHotel(hotelId);
    await withTransaction(async (client) => {
      await fieldProvenanceRepository.clearSuggestion(client, hotelId, field);
      await auditService.record(client, {
        actor,
        action: 'hotel.provider_suggestion_dismissed',
        entity: 'hotel',
        entityId: hotelId,
        newValue: { field },
      });
    });
    return hotelService.getAdmin(hotelId);
  },
};
