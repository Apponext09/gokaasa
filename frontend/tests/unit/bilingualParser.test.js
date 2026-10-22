import { test } from 'node:test';
import assert from 'node:assert/strict';
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
} from '../../src/features/support/bilingualParser.js';

const TODAY = '2026-06-01';

// ---- English text parsing --------------------------------------------------------------------------

test('English: property type is matched for hotel, resort and villa', () => {
  assert.equal(matchPropertyType('i need a resort'), 'RESORT');
  assert.equal(matchPropertyType('find a hotel'), 'HOTEL');
  assert.equal(matchPropertyType('show me villas'), 'VILLA');
  assert.equal(matchPropertyType('somewhere nice'), undefined);
});

test('English: "I need a resort in Lonavala" extracts property type and destination query', () => {
  const { criteria } = parseUtterance('I need a resort in Lonavala', TODAY);
  assert.equal(criteria.propertyType, 'RESORT');
  assert.equal(criteria.destinationQuery, 'lonavala');
});

test('English: "Find a hotel for two adults" extracts adults via a number word', () => {
  const { criteria } = parseUtterance('Find a hotel for two adults', TODAY);
  assert.equal(criteria.propertyType, 'HOTEL');
  assert.equal(criteria.adults, 2);
});

test('English: "Show me resorts with a swimming pool" extracts the real POOL amenity code', () => {
  const { criteria } = parseUtterance('Show me resorts with a swimming pool', TODAY);
  assert.deepEqual(criteria.amenities, ['POOL']);
});

// ---- Hindi text parsing -----------------------------------------------------------------------------

test('Hindi: "Mujhe Lonavala mein resort chahiye" extracts destination and property type', () => {
  const { criteria } = parseUtterance('Mujhe Lonavala mein resort chahiye', TODAY);
  assert.equal(criteria.propertyType, 'RESORT');
  assert.equal(criteria.destinationQuery, 'mujhe lonavala');
});

test('Hindi: "Do logon ke liye hotel book karna hai" extracts two adults and hotel type', () => {
  const { criteria } = parseUtterance('Do logon ke liye hotel book karna hai', TODAY);
  assert.equal(criteria.propertyType, 'HOTEL');
  assert.equal(criteria.adults, 2);
});

test('Hindi: "Swimming pool wala resort dikhao" extracts POOL and RESORT', () => {
  const { criteria } = parseUtterance('Swimming pool wala resort dikhao', TODAY);
  assert.equal(criteria.propertyType, 'RESORT');
  assert.deepEqual(criteria.amenities, ['POOL']);
});

// ---- Hindi and English number phrases ----------------------------------------------------------------

test('English number words resolve adults/rooms correctly', () => {
  assert.equal(extractAdults('two adults please'), 2);
  assert.equal(extractAdults('four guests'), 4);
  assert.equal(extractRooms('two rooms'), 2);
});

test('Hindi number words resolve adults/rooms correctly', () => {
  assert.equal(extractAdults('teen log'), 3);
  assert.equal(extractAdults('paanch guests'), 5);
  assert.equal(extractRooms('ek kamra'), 1);
});

test('digit-based counts work identically to spelled-out words', () => {
  assert.equal(extractAdults('4 adults'), 4);
  assert.equal(extractRooms('2 rooms'), 2);
});

// ---- Budget parsing and budget-type ambiguity -----------------------------------------------------

test('"My budget is five thousand rupees per night" resolves the word-based amount and PER_NIGHT type', () => {
  const budget = extractBudget('my budget is five thousand rupees per night');
  assert.deepEqual(budget, { amount: 5000, type: 'PER_NIGHT' });
});

test('Hindi: "Mera budget paanch hazaar rupaye per night hai" resolves the same way', () => {
  const budget = extractBudget('mera budget paanch hazaar rupaye per night hai');
  assert.deepEqual(budget, { amount: 5000, type: 'PER_NIGHT' });
});

test('a total-stay cue resolves TOTAL_STAY, never confused with per-night', () => {
  const budget = extractBudget('my total budget is 15000 for the whole stay');
  assert.equal(budget.amount, 15000);
  assert.equal(budget.type, 'TOTAL_STAY');
});

test('an amount with no explicit per-night/total cue is ambiguous (type null), never guessed', () => {
  const budget = extractBudget('my budget is 5000 rupees');
  assert.equal(budget.amount, 5000);
  assert.equal(budget.type, null);
});

test('parseUtterance flags "budgetType" as missing information when the amount is present but the type is not', () => {
  const { missingInformation } = parseUtterance('my budget is 5000 rupees', TODAY);
  assert.ok(missingInformation.includes('budgetType'));
});

test('no budget context at all returns null, not a false amount from an unrelated number', () => {
  assert.equal(extractBudget('two adults in room 5'), null);
});

test('lakh and hundred multipliers resolve correctly', () => {
  assert.deepEqual(extractBudget('budget do lakh total'), { amount: 200_000, type: 'TOTAL_STAY' });
  assert.deepEqual(extractBudget('budget paanch sau per night'), { amount: 500, type: 'PER_NIGHT' });
});

// ---- Destination query extraction (query only, never resolved here) --------------------------------

test('extractDestinationQuery finds the place after "in"/"at"/"near", never hardcoding a destination list', () => {
  assert.equal(extractDestinationQuery('I need a resort in Lonavala'), 'lonavala');
  assert.equal(extractDestinationQuery('Find a hotel near Goa for two'), 'goa');
  assert.equal(extractDestinationQuery('Mujhe Lonavala mein resort chahiye'), 'mujhe lonavala');
});

test('extractDestinationQuery returns null when nothing anchors a place name', () => {
  assert.equal(extractDestinationQuery('I need two adults and a pool'), null);
});

// ---- Dates: valid, invalid, and never-guessed-year behavior -----------------------------------------

test('"12 to 14 November" resolves to a real date range using the current year', () => {
  const dates = extractDates('a resort for 12 to 14 november', TODAY);
  assert.deepEqual(dates, { checkIn: '2026-11-12', checkOut: '2026-11-14' });
});

test('"November 12 to 14" (month first) is also recognized', () => {
  const dates = extractDates('november 12 to 14', TODAY);
  assert.deepEqual(dates, { checkIn: '2026-11-12', checkOut: '2026-11-14' });
});

test('a day/month that would fall in the past this year rolls forward to next year, never into the past', () => {
  // TODAY is 2026-06-01; "1 to 3 january" with no year would be in the past for 2026, so it must resolve to 2027.
  const dates = extractDates('1 to 3 january', TODAY);
  assert.deepEqual(dates, { checkIn: '2027-01-01', checkOut: '2027-01-03' });
});

test('"this weekend" resolves to the upcoming Saturday/Sunday', () => {
  const dates = extractDates('this weekend', TODAY); // 2026-06-01 is a Monday
  assert.equal(dates.checkIn, '2026-06-06'); // the following Saturday
  assert.equal(dates.checkOut, '2026-06-07');
});

test('no recognizable date phrase at all returns null, never a guessed date', () => {
  assert.equal(extractDates('a nice resort with a pool', TODAY), null);
  const { missingInformation } = parseUtterance('a nice resort with a pool', TODAY);
  assert.ok(missingInformation.includes('dates'));
});

test('an unrecognized destination phrase is reported as missing, not silently skipped', () => {
  const { missingInformation } = parseUtterance('find me a nice place with wifi', TODAY);
  assert.ok(missingInformation.includes('destination'));
});

// ---- Amenities ----------------------------------------------------------------------------------------

test('extractAmenities only ever returns real, supported codes', () => {
  assert.deepEqual(extractAmenities('wifi and parking please').sort(), ['PARKING', 'WIFI']);
  assert.deepEqual(extractAmenities('a pet friendly place with breakfast').sort(), ['BREAKFAST', 'PETS_ALLOWED']);
  assert.deepEqual(extractAmenities('nothing special'), []);
});

// ---- Voice command parsing: ambiguous input must return null, never a guess -------------------------

test('"Show the second hotel" and "Pehla hotel dikhao" resolve to a clear ordinal selection', () => {
  assert.deepEqual(parseVoiceCommand('Show the second hotel'), { command: 'SELECT_ORDINAL', index: 1 });
  assert.deepEqual(parseVoiceCommand('Pehla hotel dikhao'), { command: 'SELECT_ORDINAL', index: 0 });
});

test('"Go back" and "change my budget" resolve to their own distinct commands', () => {
  assert.deepEqual(parseVoiceCommand('go back'), { command: 'BACK' });
  assert.deepEqual(parseVoiceCommand('change my budget'), { command: 'CHANGE_BUDGET' });
});

test('an unrecognized or ambiguous phrase returns null -- the caller must ask, never guess an action', () => {
  assert.equal(parseVoiceCommand('that one looks nice I think'), null);
  assert.equal(parseVoiceCommand('book it now'), null);
});
