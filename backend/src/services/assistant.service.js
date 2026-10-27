import { config } from '../config/index.js';
import { localToday } from '../domain/businessDate.js';
import { validateAiCriteria } from '../domain/assistantCriteria.js';
import { destinationRepository } from '../repositories/destination.repository.js';
import { AiProviderError, aiProvider } from './ai/provider.js';
import { createLogger } from '../utils/logger.js';
import { catalogService } from './catalog.service.js';

const log = createLogger('assistant');
const MAX_MESSAGE_LENGTH = 500;

const FRIENDLY_REASON = {
  NOT_CONFIGURED: 'The AI assistant is not set up yet. Let’s use guided search instead.',
  TIMEOUT: 'The AI assistant is taking too long to respond. Let’s use guided search instead.',
  UNAVAILABLE: 'The AI assistant is unavailable right now. Let’s use guided search instead.',
  INVALID_OUTPUT: 'The AI assistant couldn’t understand that clearly. Let’s use guided search instead.',
};

/**
 * Resolves a free-text destination guess against real published cities/areas (destinationRepository,
 * the same data source the existing destination autocomplete already uses) -- never invents a place.
 * Returns:
 *   { resolved: {type, label, destination, area}, candidates: null }  -- exactly one real match
 *   { resolved: null, candidates: [...] }                             -- zero or multiple matches
 */
async function resolveDestination(query) {
  if (!query) return { resolved: null, candidates: [] };
  const places = await destinationRepository.publishedPlaces();
  const needle = query.trim().toLowerCase();

  const cityMatches = [...new Set(places.filter((p) => p.city?.toLowerCase().includes(needle)).map((p) => p.city))];
  const areaMatches = [...new Set(places.filter((p) => p.area?.toLowerCase().includes(needle)).map((p) => p.area))];

  const candidates = [
    ...cityMatches.map((city) => ({ type: 'CITY', label: city, destination: slugify(city) })),
    ...areaMatches.map((area) => ({ type: 'AREA', label: area, destination: slugify(area) })),
  ];

  if (candidates.length === 1) return { resolved: candidates[0], candidates: [] };
  return { resolved: null, candidates: candidates.slice(0, 6) };
}

function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function finishExtraction(criteria, missingInformation) {
  let destination = null;
  let destinationCandidates = [];
  if (criteria.destinationQuery) {
    const resolution = await resolveDestination(criteria.destinationQuery);
    destination = resolution.resolved;
    destinationCandidates = resolution.candidates;
    if (!destination && !missingInformation.includes('destination')) missingInformation.push('destination');
  }

  return {
    ok: true,
    criteria: {
      destination,
      checkIn: criteria.checkIn ?? null,
      checkOut: criteria.checkOut ?? null,
      occupancy: criteria.occupancy ?? null,
      propertyType: criteria.propertyType,
      stars: criteria.stars,
      amenities: criteria.amenities,
      dinnerIncluded: criteria.dinnerIncluded,
      freeCancellation: criteria.freeCancellation,
      budget: criteria.budget ?? null,
    },
    missingInformation,
    destinationCandidates,
    clarificationQuestion: buildClarification(missingInformation, destinationCandidates, criteria.destinationQuery),
  };
}

export const assistantService = {
  /** Whether the AI mode can even be offered -- the frontend uses this to hide/disable the option cleanly. */
  status() {
    return { configured: aiProvider.isAiConfigured() };
  },

  /**
   * The only entry point for Mode B. Never throws a raw provider error to the caller -- always resolves
   * to either a usable, validated partial search state, or a clear reason guided booking should be used
   * instead. The AI never touches the database and never calls the real search API; this only produces
   * the same shape the guided flow's own assistantState already knows how to merge and act on.
   */
  async extract(rawMessage) {
    const message = String(rawMessage ?? '').trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!message) {
      return { ok: false, reason: 'EMPTY_MESSAGE', message: 'Tell me a bit about the stay you’re looking for.' };
    }

    const timezone = config.booking.businessTimezone;
    const today = localToday(timezone);

    let raw;
    try {
      const [propertyTypes, amenities] = await Promise.all([
        catalogService.list('property-types', { activeOnly: true }),
        catalogService.list('amenities', { activeOnly: true }),
      ]);
      raw = await aiProvider.requestStructuredExtraction({ message, today, timezone, propertyTypes, amenities });
      const { criteria, missingInformation, problems } = validateAiCriteria(raw, {
        today,
        propertyTypes: propertyTypes.map((item) => item.code),
        amenityCodes: amenities.map((item) => item.code),
      });
      if (problems.length) log.info('AI output had unsupported/invalid fields, dropped safely', { problems });

      return await finishExtraction(criteria, missingInformation);
    } catch (error) {
      const reason = error instanceof AiProviderError ? error.code : 'UNAVAILABLE';
      log.warn('AI extraction unavailable, falling back to guided booking', { reason, detail: error.message });
      return { ok: false, reason, message: FRIENDLY_REASON[reason] ?? FRIENDLY_REASON.UNAVAILABLE };
    }
  },
};

function buildClarification(missingInformation, destinationCandidates, destinationQuery) {
  if (destinationCandidates.length > 1) {
    const names = destinationCandidates.map((c) => c.label).join(', ');
    return `I found a few places matching "${destinationQuery}": ${names}. Which one did you mean?`;
  }
  if (missingInformation.includes('destination')) {
    return destinationQuery
      ? `I couldn’t find "${destinationQuery}" among our destinations. Could you try a different city or area?`
      : 'Which city or area would you like to stay in?';
  }
  if (missingInformation.includes('dates')) return 'What are your check-in and check-out dates? Please include the month (and year, if not obvious).';
  if (missingInformation.includes('guests')) return 'How many guests and rooms should I look for?';
  if (missingInformation.includes('budget')) return 'Is that budget per night, or for the whole stay?';
  return null;
}
