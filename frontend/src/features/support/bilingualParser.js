/**
 * Deterministic, rule-based Hindi/English extraction for free-text (typed or spoken) stay requirements.
 * No AI, no network call, no external dependency -- pure string matching over fixed, documented
 * dictionaries, directly unit-testable. Mirrors the SAME output shape the backend's optional AI mode
 * produces (see assistant.service.js's criteria shape), so the caller can merge either source into the
 * same assistantState with mergeExtractedCriteria -- this is a genuine alternative producer of that
 * shape, not a second search/booking system.
 *
 * This module only ever extracts search PREFERENCES. It never resolves a destination against real data
 * (that still goes through the existing destination-suggest API in the UI layer), never validates dates
 * against "today" by itself (the caller does, via the existing validateStay), and never creates a hold or
 * confirms a payment -- it has no access to those APIs at all.
 *
 * Documented coverage (not exhaustive -- anything outside this list is correctly left unmatched rather
 * than guessed):
 *   - Numbers: English 0-20 + Hindi (romanized) 0-20, plus "hazaar"/"thousand" (x1,000),
 *     "lakh" (x100,000), "sau"/"hundred" (x100) multipliers for amounts like "paanch hazaar" (5,000).
 *   - Property types: hotel, resort, villa (English words, already commonly used in Hindi speech too).
 *   - Amenities: the same 5 real codes the guided flow and AI mode already offer (WIFI, POOL, PARKING,
 *     BREAKFAST, PETS_ALLOWED).
 *   - Budget: an amount plus an explicit PER_NIGHT/TOTAL_STAY cue; if the cue is missing, the type is
 *     left null (ambiguous) rather than assumed, exactly as the AI-mode schema already requires.
 *   - Dates: "<day> to <day> <Month>" / "<Month> <day> to <day>" (any of English's full month names,
 *     already the form used in the Hindi example sentence itself), plus a small relative set ("this
 *     weekend"/"is weekend", "next weekend"/"agla/agle weekend"). No year is treated as ambiguous by
 *     itself: the current year is used, rolled forward one year only if that date would otherwise
 *     already be in the past -- the same resolution a human would apply, not a guess.
 */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const NUMBER_WORDS = {
  zero: 0, ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, char: 4, chaar: 4, four: 4,
  paanch: 5, panch: 5, five: 5, chhe: 6, che: 6, six: 6, saat: 7, seven: 7, aath: 8, eight: 8,
  nau: 9, nine: 9, das: 10, dus: 10, ten: 10, gyarah: 11, eleven: 11, barah: 12, twelve: 12,
  terah: 13, thirteen: 13, chaudah: 14, fourteen: 14, pandrah: 15, fifteen: 15, solah: 16, sixteen: 16,
  satrah: 17, seventeen: 17, atharah: 18, eighteen: 18, unnees: 19, nineteen: 19, bees: 20, twenty: 20,
};

const MULTIPLIER_WORDS = { hazaar: 1000, hazar: 1000, thousand: 1000, lakh: 100_000, lac: 100_000, sau: 100, hundred: 100 };

const PROPERTY_TYPE_KEYWORDS = [
  { re: /\bresorts?\b/, value: 'RESORT' },
  { re: /\bvillas?\b/, value: 'VILLA' },
  { re: /\bhotels?\b/, value: 'HOTEL' },
];

const AMENITY_KEYWORDS = [
  { re: /\b(swimming[\s-]?pool|pool)\b/, code: 'POOL' },
  { re: /\b(wi[\s-]?fi|internet)\b/, code: 'WIFI' },
  { re: /\bparking\b/, code: 'PARKING' },
  { re: /\b(breakfast|nashta|naashta)\b/, code: 'BREAKFAST' },
  { re: /\b(pet[\s-]?friendly|pets?( allowed)?|paltu)\b/, code: 'PETS_ALLOWED' },
];

const PER_NIGHT_CUES = /\b(per night|a night|ek raat|prati raat|raat ka|per raat)\b/;
const TOTAL_STAY_CUES = /\b(total|poora|poore|pura|pure|sab milakar|sabmilakar|poora budget|whole stay|entire stay|total stay)\b/;

const ADULT_CUES = /\b(adults?|guests?|logo?n?|vyakti|log)\b/;
const ROOM_CUES = /\b(rooms?|kamre?|kamra)\b/;

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// A sanity bound only -- the guided flow's own validateStay and the backend's search validator both
// enforce the platform's real maximum stay length independently; this just stops an outlandish spoken
// number ("999 nights") from producing a checkOut decades away before either of those ever sees it.
const MAX_PLAUSIBLE_NIGHTS = 60;

function normalize(text) {
  return String(text ?? '').toLowerCase().replace(/[,.!?]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** A run of number-words (e.g. "paanch hazaar") or digits (e.g. "5000", "5,000"), evaluated left to right. */
function extractAmount(text) {
  const digitMatch = text.match(/\b\d[\d,]*(?:\.\d+)?\b/);
  if (digitMatch) {
    const value = Number(digitMatch[0].replace(/,/g, ''));
    if (Number.isFinite(value) && value > 0) return value;
  }
  const tokens = text.split(' ');
  for (let i = 0; i < tokens.length; i += 1) {
    const base = NUMBER_WORDS[tokens[i]];
    if (base === undefined) continue;
    const multiplier = MULTIPLIER_WORDS[tokens[i + 1]];
    if (multiplier) return base * multiplier;
    if (base > 0) return base;
  }
  return null;
}

/** The first standalone small number-word or digit near one of `cueRegex`'s matches (e.g. "two adults"). */
function extractCount(text, cueRegex) {
  const tokens = text.split(' ');
  for (let i = 0; i < tokens.length; i += 1) {
    if (!cueRegex.test(tokens[i])) continue;
    for (const j of [i - 1, i + 1]) {
      const word = tokens[j];
      if (word === undefined) continue;
      if (/^\d+$/.test(word)) return Number(word);
      if (NUMBER_WORDS[word] !== undefined) return NUMBER_WORDS[word];
    }
  }
  return null;
}

export function matchPropertyType(text) {
  for (const { re, value } of PROPERTY_TYPE_KEYWORDS) {
    if (re.test(text)) return value;
  }
  return undefined;
}

export function extractAmenities(text) {
  const found = [];
  for (const { re, code } of AMENITY_KEYWORDS) {
    if (re.test(text)) found.push(code);
  }
  return found;
}

/** Returns { amount, type } with type possibly null (ambiguous) -- never guessed. Null if no amount at all. */
export function extractBudget(text) {
  const hasBudgetContext = /\bbudget\b/.test(text) || PER_NIGHT_CUES.test(text) || TOTAL_STAY_CUES.test(text) || /\brupees?|rs\.?|₹\b/.test(text);
  if (!hasBudgetContext) return null;
  const amount = extractAmount(text);
  if (!amount) return null;
  const type = PER_NIGHT_CUES.test(text) ? 'PER_NIGHT' : TOTAL_STAY_CUES.test(text) ? 'TOTAL_STAY' : null;
  return { amount, type };
}

export function extractAdults(text) {
  return extractCount(text, ADULT_CUES);
}

export function extractRooms(text) {
  return extractCount(text, ROOM_CUES);
}

const DESTINATION_ANCHORS = new Set(['in', 'at', 'near']);

// Words that are never part of a destination name: common English/Hindi connector and filler words,
// temporal words, and the same guest/room/amenity/property-type/budget cue words this file already
// recognizes elsewhere. Scanning stops the instant one of these is seen, in either direction -- this is
// what keeps "at Lonavala next weekend" from swallowing "next weekend", and "Mujhe Lonavala mein" from
// swallowing the leading "Mujhe" ("I want"), while still letting a real multi-word place name (e.g.
// "New Delhi", "Pune station") through untouched, since none of ITS words are in this list.
const DESTINATION_STOP_WORDS = new Set([
  // English connectors / filler
  'a', 'the', 'i', 'we', 'want', 'need', 'to', 'book', 'booking', 'please', 'find', 'show', 'me', 'for', 'with', 'and',
  // Hindi (romanized) connectors / filler
  'mujhe', 'humein', 'hamen', 'hame', 'mera', 'humara', 'hamara', 'chahiye', 'chaiye', 'hai', 'karna', 'karo', 'dikhao',
  // Temporal signal words -- a real place name is never one of these
  'next', 'this', 'tomorrow', 'tonight', 'weekend', 'agla', 'agle', 'is', 'night', 'nights', 'raat',
  ...WEEKDAYS,
  ...MONTHS,
  // Guest/room/amenity/property-type/budget cue words (mirrors the other extractors in this file)
  'adult', 'adults', 'guest', 'guests', 'log', 'logo', 'logon', 'vyakti',
  'room', 'rooms', 'kamra', 'kamre',
  'budget', 'rupees', 'rupaye', 'rs', 'per', 'total',
  'hotel', 'hotels', 'resort', 'resorts', 'villa', 'villas',
  'pool', 'wifi', 'parking', 'breakfast', 'pets', 'pet',
]);

/** True for a token that can never be part of a destination name: a stop word, a digit, or a number word. */
function isDestinationStopToken(token) {
  return DESTINATION_STOP_WORDS.has(token) || /^\d+$/.test(token) || NUMBER_WORDS[token] !== undefined;
}

const MAX_DESTINATION_WORDS = 4;

/**
 * A destination QUERY string only -- never resolved here. Looks for a run of words right after a
 * destination anchor ("in X", "near X") or right before the Hindi postposition "mein" ("X mein"). Each
 * direction stops at the first stop word (see DESTINATION_STOP_WORDS) or after MAX_DESTINATION_WORDS,
 * whichever comes first -- a real multi-word place name is kept whole, but a sentence that doesn't end
 * right at the place name no longer bleeds unrelated trailing/leading words into the result. The caller
 * always resolves this against the real destination-suggest API; if nothing anchors, this returns null
 * and the caller asks the user via the existing destination step.
 */
export function extractDestinationQuery(rawText) {
  const text = normalize(rawText);
  const tokens = text.split(' ');

  const anchorIndex = tokens.findIndex((token) => DESTINATION_ANCHORS.has(token));
  if (anchorIndex !== -1) {
    const words = [];
    for (let i = anchorIndex + 1; i < tokens.length && words.length < MAX_DESTINATION_WORDS; i += 1) {
      if (!/^[a-z]+$/.test(tokens[i]) || isDestinationStopToken(tokens[i])) break;
      words.push(tokens[i]);
    }
    if (words.length) return words.join(' ');
  }

  const meinIndex = tokens.indexOf('mein');
  if (meinIndex > 0) {
    const words = [];
    for (let i = meinIndex - 1; i >= 0 && words.length < MAX_DESTINATION_WORDS; i -= 1) {
      if (!/^[a-z]+$/.test(tokens[i]) || isDestinationStopToken(tokens[i])) break;
      words.unshift(tokens[i]);
    }
    if (words.length) return words.join(' ');
  }

  return null;
}

/** Day-of-week index (0=Sunday) of the next occurrence of `weekday` on/after `fromIso`, exclusive of today unless it matches and `inclusive`. */
function nextWeekday(fromIso, weekdayIndex, { inclusive = false } = {}) {
  const d = new Date(`${fromIso}T00:00:00Z`);
  const current = d.getUTCDay();
  let delta = (weekdayIndex - current + 7) % 7;
  if (delta === 0 && !inclusive) delta = 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Resolves a day+month (no year stated) against `todayIso`'s year, rolling forward one year only if the
 * result would otherwise already be in the past -- a determinate rule, not a guess. */
function resolveYearless(day, monthIndex, todayIso) {
  const year = Number(todayIso.slice(0, 4));
  let candidate = `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
  if (candidate < todayIso) candidate = `${year + 1}-${pad2(monthIndex + 1)}-${pad2(day)}`;
  return candidate;
}

// "kal" is genuinely ambiguous in Hindi (it can mean either "yesterday" or "tomorrow"), but this parser
// only ever extracts a stay for a FUTURE booking, so -- the same determinate, context-driven rule
// resolveYearless already applies to a bare day+month -- the only sensible reading here is "tomorrow".
const RELATIVE_DAY_WORDS = { today: 0, aaj: 0, tomorrow: 1, kal: 1 };
const DAY_REFERENCE_WORDS = [...Object.keys(RELATIVE_DAY_WORDS), ...WEEKDAYS];

/** Resolves a single reference word ("today", "tomorrow", "aaj", "kal", or a weekday name) to an ISO
 * date relative to `fromIso`. For a weekday, this is always the next occurrence STRICTLY after
 * `fromIso` (never today itself), the same semantics the existing "next <weekday>" pattern already uses. */
function resolveDateReference(word, fromIso) {
  if (RELATIVE_DAY_WORDS[word] !== undefined) return addDaysIso(fromIso, RELATIVE_DAY_WORDS[word]);
  const weekdayIndex = WEEKDAYS.indexOf(word);
  if (weekdayIndex !== -1) return nextWeekday(fromIso, weekdayIndex, { inclusive: false });
  return null;
}

/**
 * Extracts { checkIn, checkOut } (both or neither -- never just one) from a numeric day-range plus an
 * English month name (the same form the Hindi example sentences themselves already use), an explicit
 * night count from a relative reference ("3 nights from Friday"), a relative-to-relative range with no
 * month name ("tomorrow to Thursday"), or a small set of fixed relative phrases. Returns null if nothing
 * recognizable is found; the caller falls back to asking -- a reference this function does not
 * recognize is never guessed at.
 */
export function extractDates(text, todayIso) {
  const monthPattern = MONTHS.join('|');
  const dayMonth = text.match(new RegExp(`\\b(\\d{1,2})\\s*(?:to|se|-)\\s*(\\d{1,2})\\s+(${monthPattern})\\b`));
  if (dayMonth) {
    const [, d1, d2, month] = dayMonth;
    const monthIndex = MONTHS.indexOf(month);
    const checkIn = resolveYearless(Number(d1), monthIndex, todayIso);
    const checkOut = resolveYearless(Number(d2), monthIndex, todayIso);
    if (checkOut > checkIn) return { checkIn, checkOut };
  }
  const monthDay = text.match(new RegExp(`\\b(${monthPattern})\\s+(\\d{1,2})\\s*(?:to|-)\\s*(\\d{1,2})\\b`));
  if (monthDay) {
    const [, month, d1, d2] = monthDay;
    const monthIndex = MONTHS.indexOf(month);
    const checkIn = resolveYearless(Number(d1), monthIndex, todayIso);
    const checkOut = resolveYearless(Number(d2), monthIndex, todayIso);
    if (checkOut > checkIn) return { checkIn, checkOut };
  }

  if (/\b(this weekend|is weekend)\b/.test(text)) {
    const checkIn = nextWeekday(todayIso, 6, { inclusive: true }); // Saturday
    return { checkIn, checkOut: addDaysIso(checkIn, 1) };
  }
  if (/\b(next weekend|agl[ae] weekend)\b/.test(text)) {
    const thisSaturday = nextWeekday(todayIso, 6, { inclusive: true });
    const checkIn = addDaysIso(thisSaturday, 7);
    return { checkIn, checkOut: addDaysIso(checkIn, 1) };
  }
  for (let w = 0; w < WEEKDAYS.length; w += 1) {
    if (new RegExp(`\\bnext ${WEEKDAYS[w]}\\b`).test(text)) {
      const checkIn = nextWeekday(todayIso, w, { inclusive: false });
      return { checkIn, checkOut: addDaysIso(checkIn, 1) };
    }
  }

  // "3 nights from Friday" (English: reference AFTER "from") / "2 raat kal se" (Hindi: reference
  // BEFORE the "se" postposition -- the opposite word order). The reference itself is resolved relative
  // to today, exactly like every other relative phrase in this function; an unrecognized reference word
  // falls through to the checks below instead of guessing a date.
  const referencePattern = DAY_REFERENCE_WORDS.join('|');
  const nightsFrom =
    text.match(new RegExp(`\\b(\\d+|[a-z]+)\\s+nights?\\s+(?:from|starting(?:\\s+from)?)\\s+(${referencePattern})\\b`)) ??
    text.match(new RegExp(`\\b(\\d+|[a-z]+)\\s+raat\\s+(${referencePattern})\\s+se\\b`));
  if (nightsFrom) {
    const [, countRaw, refWord] = nightsFrom;
    const nights = /^\d+$/.test(countRaw) ? Number(countRaw) : NUMBER_WORDS[countRaw];
    const checkIn = resolveDateReference(refWord, todayIso);
    if (Number.isInteger(nights) && nights > 0 && nights <= MAX_PLAUSIBLE_NIGHTS && checkIn) {
      return { checkIn, checkOut: addDaysIso(checkIn, nights) };
    }
  }

  // "tomorrow to Thursday" / "Friday to Sunday" -- a relative-to-relative range with no month name at
  // all. The end reference is resolved relative to the START date actually chosen (not "today"), so
  // "Friday to Sunday" never wraps to the wrong week; an end reference that doesn't land strictly after
  // the start (e.g. a nonsensical "Sunday to Friday" read literally) is correctly rejected, not guessed.
  const relativeRange = text.match(new RegExp(`\\b(${referencePattern})\\s*(?:to|se|-)\\s*(${referencePattern})\\b`));
  if (relativeRange) {
    const [, fromWord, toWord] = relativeRange;
    const checkIn = resolveDateReference(fromWord, todayIso);
    if (checkIn) {
      const checkOut = resolveDateReference(toWord, checkIn);
      if (checkOut && checkOut > checkIn) return { checkIn, checkOut };
    }
  }

  return null;
}

/**
 * The single entry point. Returns `{ criteria, missingInformation }` in the same shape
 * mergeExtractedCriteria already accepts from the backend AI mode's response, so both sources of
 * extraction are handled identically by the caller.
 */
export function parseUtterance(rawText, todayIso) {
  const text = normalize(rawText);
  const criteria = {};
  const missingInformation = [];

  const propertyType = matchPropertyType(text);
  if (propertyType !== undefined) criteria.propertyType = propertyType;

  const destinationQuery = extractDestinationQuery(text);
  if (destinationQuery) criteria.destinationQuery = destinationQuery;
  else missingInformation.push('destination');

  const dates = extractDates(text, todayIso);
  if (dates) {
    criteria.checkIn = dates.checkIn;
    criteria.checkOut = dates.checkOut;
  } else {
    missingInformation.push('dates');
  }

  const adults = extractAdults(text);
  if (adults != null && adults > 0) criteria.adults = adults;
  const rooms = extractRooms(text);
  if (rooms != null && rooms > 0) criteria.rooms = rooms;

  const amenities = extractAmenities(text);
  if (amenities.length) criteria.amenities = amenities;

  if (/\b(dinner included|dinner)\b/.test(text)) criteria.dinnerIncluded = true;
  if (/\b(free cancellation|refundable)\b/.test(text)) criteria.freeCancellation = true;

  const budget = extractBudget(text);
  if (budget) {
    criteria.budget = budget;
    if (budget.type == null) missingInformation.push('budgetType');
  }

  return { criteria, missingInformation };
}

/**
 * A small, deliberately narrow set of navigation voice/text commands for the results/comparison steps
 * ("show the second hotel", "pehla hotel dikhao", "go back", "change my budget"). Anything not matching
 * one of these exactly returns null -- the caller must then ask for confirmation rather than guess at
 * intent, per the explicit requirement that unclear speech never triggers an action.
 */
const ORDINAL_WORDS = { first: 1, pehla: 1, pehli: 1, second: 2, doosra: 2, dusra: 2, third: 3, teesra: 3, tisra: 3, fourth: 4, chautha: 4, fifth: 5, paanchwa: 5 };

export function parseVoiceCommand(rawText) {
  const text = normalize(rawText);
  const ordinalMatch = text.match(/\b(first|second|third|fourth|fifth|pehla|pehli|doosra|dusra|teesra|tisra|chautha|paanchwa)\b/);
  if (/\b(show|dikhao|select|choose)\b/.test(text) && ordinalMatch) {
    return { command: 'SELECT_ORDINAL', index: ORDINAL_WORDS[ordinalMatch[1]] - 1 };
  }
  if (/\b(go back|back|peeche|wapas)\b/.test(text)) return { command: 'BACK' };
  if (/\b(change (my )?budget|budget badlo|budget change)\b/.test(text)) return { command: 'CHANGE_BUDGET' };
  if (/\b(change (my )?dates?|date badlo|tareekh badlo)\b/.test(text)) return { command: 'CHANGE_DATES' };
  if (/\b(change (my )?guests?|guests? badlo)\b/.test(text)) return { command: 'CHANGE_GUESTS' };
  if (/\b(compare)\b/.test(text)) return { command: 'COMPARE' };
  return null;
}
