import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGuestFormSchema, defaultGuestValues, toGuestDetailsPayload } from '../../src/features/booking/bookingSchemas.js';

const occupancy = [{ adults: 2, childAges: [7] }];
const primaryContact = { firstName: 'Asha', lastName: 'Rao', email: ' Asha@Example.com ', mobile: '+91 98765-43210' };
const blank = () => ({ firstName: '', lastName: '', age: '' });

function form(guests, extra = {}) {
  return {
    primaryContact,
    rooms: [{ guests }],
    gstNumber: '',
    companyName: '',
    billingAddress: '',
    specialRequest: '',
    ...extra,
  };
}

const adult = (age = '34') => ({ firstName: 'Ravi', lastName: 'Kumar', age });
const child = (age = '7') => ({ firstName: 'Mira', lastName: 'Kumar', age });

test('a room with every guest fully named passes', () => {
  const result = buildGuestFormSchema().safeParse(form([adult(), adult('40'), child()]));
  assert.equal(result.success, true, JSON.stringify(result.error?.issues));
});

test('a guest left entirely blank is accepted -- naming each occupant is optional beyond the lead contact', () => {
  const result = buildGuestFormSchema().safeParse(form([adult(), blank(), blank()]));
  assert.equal(result.success, true, JSON.stringify(result.error?.issues));
});

test('every guest left blank is accepted too -- only the lead contact above is required', () => {
  const result = buildGuestFormSchema().safeParse(form([blank(), blank(), blank()]));
  assert.equal(result.success, true, JSON.stringify(result.error?.issues));
});

test('a first name given with no last name is rejected -- half a name is ambiguous, not "not provided yet"', () => {
  const result = buildGuestFormSchema().safeParse(form([{ firstName: 'Ravi', lastName: '', age: '34' }, blank(), blank()]));
  assert.equal(result.success, false);
  assert.match(result.error.issues[0].message, /both first and last name/i);
});

test('a missing age on an otherwise-named guest is accepted, not an error', () => {
  const result = buildGuestFormSchema().safeParse(form([{ firstName: 'Ravi', lastName: 'Kumar', age: '' }, blank(), blank()]));
  assert.equal(result.success, true, JSON.stringify(result.error?.issues));
});

test('an out-of-range age is still rejected when one is actually given', () => {
  const result = buildGuestFormSchema().safeParse(form([{ firstName: 'Ravi', lastName: 'Kumar', age: '200' }, blank(), blank()]));
  assert.equal(result.success, false);
  assert.ok(result.error.issues.some((issue) => issue.message.includes('120')));
});

test('contact email is normalised and the mobile number is checked', () => {
  const ok = buildGuestFormSchema().safeParse(form([adult(), adult(), child()]));
  assert.equal(ok.data.primaryContact.email, 'asha@example.com');
  assert.equal(ok.data.primaryContact.mobile, '+919876543210');

  const bad = buildGuestFormSchema().safeParse(
    form([adult(), adult(), child()], { primaryContact: { ...primaryContact, mobile: '12' } }),
  );
  assert.equal(bad.success, false);
});

test('a GST number must be exactly 15 characters when given', () => {
  const schema = buildGuestFormSchema();
  const base = [adult(), adult(), child()];
  assert.equal(schema.safeParse(form(base, { gstNumber: '27AAAPL1234C1ZV' })).success, true);
  assert.equal(schema.safeParse(form(base, { gstNumber: 'SHORT' })).success, false);
});

test('defaults prefill children from the search, and a saved draft wins', () => {
  const fresh = defaultGuestValues(occupancy);
  assert.equal(fresh.rooms[0].guests.length, 3);
  assert.equal(fresh.rooms[0].guests[2].age, '7');

  const saved = { primaryContact, rooms: [{ roomIndex: 0, guests: [adult('45'), adult('42'), child('8')] }], companyName: 'Acme' };
  const restored = defaultGuestValues(occupancy, saved);
  assert.equal(restored.rooms[0].guests[0].age, '45');
  assert.equal(restored.companyName, 'Acme');
});

test('the request body carries numeric ages and omits empty optional fields', () => {
  const values = form([adult(' 34 '), adult(), child()]);
  values.rooms[0].guests[0].age = '34';
  const payload = toGuestDetailsPayload(values);
  assert.equal(payload.rooms[0].guests[0].age, 34);
  assert.equal(payload.rooms[0].roomIndex, 0);
  // Undefined values are dropped when the body is serialised, so the server never sees empty optional fields.
  assert.equal(JSON.parse(JSON.stringify(payload)).gstNumber, undefined);
  assert.equal(JSON.parse(JSON.stringify(payload)).specialRequest, undefined);
});

test('a guest left entirely blank is dropped from the payload, never sent as a fabricated empty-named guest', () => {
  const payload = toGuestDetailsPayload(form([adult(), blank(), blank()]));
  assert.equal(payload.rooms[0].guests.length, 1);
  assert.equal(payload.rooms[0].guests[0].firstName, 'Ravi');
});

test('a named guest with no age omits the age field entirely rather than sending NaN', () => {
  const payload = toGuestDetailsPayload(form([{ firstName: 'Ravi', lastName: 'Kumar', age: '' }]));
  assert.equal('age' in payload.rooms[0].guests[0], false);
});
