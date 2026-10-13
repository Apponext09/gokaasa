import {
  extractAdults,
  extractAmenities,
  extractBudget,
  extractDates,
  extractDestinationQuery,
  extractRooms,
  matchPropertyType,
  parseUtterance,
  parseVoiceCommand,
} from '../../src/features/assistant/bilingualParser.js';

// A direct port of the website's tests/unit/bilingualParser.test.js for the SAME module (copied verbatim
// into this app, see assistant/bilingualParser.js's header comment), in jest syntax instead of node:test.
const TODAY = '2026-06-01';

describe('bilingualParser (English)', () => {
  test('property type is matched for hotel, resort and villa', () => {
    expect(matchPropertyType('i need a resort')).toBe('RESORT');
    expect(matchPropertyType('find a hotel')).toBe('HOTEL');
    expect(matchPropertyType('show me villas')).toBe('VILLA');
    expect(matchPropertyType('somewhere nice')).toBeUndefined();
  });

  test('"I need a resort in Lonavala" extracts property type and destination query', () => {
    const { criteria } = parseUtterance('I need a resort in Lonavala', TODAY);
    expect(criteria.propertyType).toBe('RESORT');
    expect(criteria.destinationQuery).toBe('lonavala');
  });

  test('"Find a hotel for two adults" extracts adults via a number word', () => {
    const { criteria } = parseUtterance('Find a hotel for two adults', TODAY);
    expect(criteria.propertyType).toBe('HOTEL');
    expect(criteria.adults).toBe(2);
  });

  test('"Show me resorts with a swimming pool" extracts the real POOL amenity code', () => {
    const { criteria } = parseUtterance('Show me resorts with a swimming pool', TODAY);
    expect(criteria.amenities).toEqual(['POOL']);
  });
});

describe('bilingualParser (Hindi, romanized)', () => {
  test('"Mujhe Lonavala mein resort chahiye" extracts destination and property type', () => {
    const { criteria } = parseUtterance('Mujhe Lonavala mein resort chahiye', TODAY);
    expect(criteria.propertyType).toBe('RESORT');
    expect(criteria.destinationQuery).toBe('mujhe lonavala');
  });

  test('"Do logon ke liye hotel book karna hai" extracts two adults and hotel type', () => {
    const { criteria } = parseUtterance('Do logon ke liye hotel book karna hai', TODAY);
    expect(criteria.propertyType).toBe('HOTEL');
    expect(criteria.adults).toBe(2);
  });

  test('"Swimming pool wala resort dikhao" extracts POOL and RESORT', () => {
    const { criteria } = parseUtterance('Swimming pool wala resort dikhao', TODAY);
    expect(criteria.propertyType).toBe('RESORT');
    expect(criteria.amenities).toEqual(['POOL']);
  });
});

describe('number words', () => {
  test('English number words resolve adults/rooms correctly', () => {
    expect(extractAdults('two adults please')).toBe(2);
    expect(extractAdults('four guests')).toBe(4);
    expect(extractRooms('two rooms')).toBe(2);
  });

  test('Hindi number words resolve adults/rooms correctly', () => {
    expect(extractAdults('teen log')).toBe(3);
    expect(extractAdults('paanch guests')).toBe(5);
    expect(extractRooms('ek kamra')).toBe(1);
  });

  test('digit-based counts work identically to spelled-out words', () => {
    expect(extractAdults('4 adults')).toBe(4);
    expect(extractRooms('2 rooms')).toBe(2);
  });
});

describe('budget parsing', () => {
  test('"My budget is five thousand rupees per night" resolves the word-based amount and PER_NIGHT type', () => {
    expect(extractBudget('my budget is five thousand rupees per night')).toEqual({ amount: 5000, type: 'PER_NIGHT' });
  });

  test('Hindi: "Mera budget paanch hazaar rupaye per night hai" resolves the same way', () => {
    expect(extractBudget('mera budget paanch hazaar rupaye per night hai')).toEqual({ amount: 5000, type: 'PER_NIGHT' });
  });

  test('a total-stay cue resolves TOTAL_STAY, never confused with per-night', () => {
    const budget = extractBudget('my total budget is 15000 for the whole stay');
    expect(budget.amount).toBe(15000);
    expect(budget.type).toBe('TOTAL_STAY');
  });

  test('an amount with no explicit per-night/total cue is ambiguous (type null), never guessed', () => {
    const budget = extractBudget('my budget is 5000 rupees');
    expect(budget.amount).toBe(5000);
    expect(budget.type).toBeNull();
  });

  test('parseUtterance flags "budgetType" as missing information when the amount is present but the type is not', () => {
    const { missingInformation } = parseUtterance('my budget is 5000 rupees', TODAY);
    expect(missingInformation).toContain('budgetType');
  });

  test('no budget context at all returns null, not a false amount from an unrelated number', () => {
    expect(extractBudget('two adults in room 5')).toBeNull();
  });

  test('lakh and hundred multipliers resolve correctly', () => {
    expect(extractBudget('budget do lakh total')).toEqual({ amount: 200_000, type: 'TOTAL_STAY' });
    expect(extractBudget('budget paanch sau per night')).toEqual({ amount: 500, type: 'PER_NIGHT' });
  });
});

describe('destination query extraction', () => {
  test('finds the place after "in"/"at"/"near", never hardcoding a destination list', () => {
    expect(extractDestinationQuery('I need a resort in Lonavala')).toBe('lonavala');
    expect(extractDestinationQuery('Find a hotel near Goa for two')).toBe('goa');
    expect(extractDestinationQuery('Mujhe Lonavala mein resort chahiye')).toBe('mujhe lonavala');
  });

  test('returns null when nothing anchors a place name', () => {
    expect(extractDestinationQuery('I need two adults and a pool')).toBeNull();
  });
});

describe('date extraction', () => {
  test('"12 to 14 November" resolves to a real date range using the current year', () => {
    expect(extractDates('a resort for 12 to 14 november', TODAY)).toEqual({ checkIn: '2026-11-12', checkOut: '2026-11-14' });
  });

  test('"November 12 to 14" (month first) is also recognized', () => {
    expect(extractDates('november 12 to 14', TODAY)).toEqual({ checkIn: '2026-11-12', checkOut: '2026-11-14' });
  });

  test('a day/month that would fall in the past this year rolls forward to next year, never into the past', () => {
    expect(extractDates('1 to 3 january', TODAY)).toEqual({ checkIn: '2027-01-01', checkOut: '2027-01-03' });
  });

  test('"this weekend" resolves to the upcoming Saturday/Sunday', () => {
    const dates = extractDates('this weekend', TODAY); // 2026-06-01 is a Monday
    expect(dates.checkIn).toBe('2026-06-06');
    expect(dates.checkOut).toBe('2026-06-07');
  });

  test('no recognizable date phrase at all returns null, never a guessed date', () => {
    expect(extractDates('a nice resort with a pool', TODAY)).toBeNull();
    const { missingInformation } = parseUtterance('a nice resort with a pool', TODAY);
    expect(missingInformation).toContain('dates');
  });
});

describe('amenities', () => {
  test('extractAmenities only ever returns real, supported codes', () => {
    expect(extractAmenities('wifi and parking please').sort()).toEqual(['PARKING', 'WIFI']);
    expect(extractAmenities('a pet friendly place with breakfast').sort()).toEqual(['BREAKFAST', 'PETS_ALLOWED']);
    expect(extractAmenities('nothing special')).toEqual([]);
  });
});

describe('voice/navigation command parsing', () => {
  test('"Show the second hotel" and "Pehla hotel dikhao" resolve to a clear ordinal selection', () => {
    expect(parseVoiceCommand('Show the second hotel')).toEqual({ command: 'SELECT_ORDINAL', index: 1 });
    expect(parseVoiceCommand('Pehla hotel dikhao')).toEqual({ command: 'SELECT_ORDINAL', index: 0 });
  });

  test('"Go back" and "change my budget" resolve to their own distinct commands', () => {
    expect(parseVoiceCommand('go back')).toEqual({ command: 'BACK' });
    expect(parseVoiceCommand('change my budget')).toEqual({ command: 'CHANGE_BUDGET' });
  });

  test('an unrecognized or ambiguous phrase returns null -- the caller must ask, never guess an action', () => {
    expect(parseVoiceCommand('that one looks nice I think')).toBeNull();
    expect(parseVoiceCommand('book it now')).toBeNull();
  });
});
