import assert from 'node:assert/strict';
import test from 'node:test';

import { EMPTY_HOTEL_FORM, hotelFormSchema, TAB_FIELDS, toPayload } from '../../src/features/hotels/hotelForm.js';

test('the manual hotel location form uses one URL instead of coordinate inputs', () => {
  assert.ok(TAB_FIELDS.location.includes('locationUrl'));
  assert.ok(!TAB_FIELDS.location.includes('latitude'));
  assert.ok(!TAB_FIELDS.location.includes('longitude'));
});

test('a valid map URL is sent as locationUrl', () => {
  const values = {
    ...EMPTY_HOTEL_FORM,
    name: 'Test Hotel',
    city: 'Pune',
    countryCode: 'IN',
    locationUrl: 'https://maps.app.goo.gl/example',
  };
  assert.equal(hotelFormSchema.safeParse(values).success, true);
  const payload = toPayload(values);
  assert.equal(payload.locationUrl, values.locationUrl);
  assert.equal('latitude' in payload, false);
  assert.equal('longitude' in payload, false);
});

test('locationUrl rejects non-web protocols', () => {
  const result = hotelFormSchema.safeParse({
    ...EMPTY_HOTEL_FORM,
    name: 'Test Hotel',
    city: 'Pune',
    countryCode: 'IN',
    locationUrl: 'javascript:alert(1)',
  });
  assert.equal(result.success, false);
});
