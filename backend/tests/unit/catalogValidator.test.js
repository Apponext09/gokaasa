import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogCreateSchema, catalogUpdateSchema } from '../../src/validators/catalog.validator.js';
import { validateAiCriteria } from '../../src/domain/assistantCriteria.js';

test('master values accept generated-code inputs and amenity categories', () => {
  assert.equal(catalogCreateSchema.parse({ name: 'Heritage Haveli' }).name, 'Heritage Haveli');
  assert.equal(catalogCreateSchema.parse({ name: 'Private Jacuzzi', category: 'WELLNESS' }).category, 'WELLNESS');
  assert.equal(catalogCreateSchema.safeParse({ name: 'X' }).success, false);
  assert.equal(catalogCreateSchema.safeParse({ name: 'Jacuzzi', category: 'MADE_UP' }).success, false);
});

test('master updates require an actual change', () => {
  assert.equal(catalogUpdateSchema.safeParse({}).success, false);
  assert.equal(catalogUpdateSchema.parse({ isActive: false }).isActive, false);
});

test('assistant criteria accepts values supplied by the dynamic catalog', () => {
  const raw = { destinationQuery: 'Goa', propertyType: 'HERITAGE_HAVELI', amenities: ['PRIVATE_JACUZZI'] };
  const result = validateAiCriteria(raw, {
    today: '2026-10-27',
    propertyTypes: ['HERITAGE_HAVELI'],
    amenityCodes: ['PRIVATE_JACUZZI'],
  });
  assert.equal(result.criteria.propertyType, 'HERITAGE_HAVELI');
  assert.deepEqual(result.criteria.amenities, ['PRIVATE_JACUZZI']);
});
