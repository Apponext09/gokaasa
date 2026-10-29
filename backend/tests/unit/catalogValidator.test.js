import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_KINDS, catalogCreateSchema, catalogKindParam, catalogUpdateSchema } from '../../src/validators/catalog.validator.js';
import { ratePlanCreateSchema, roomTypeCreateSchema } from '../../src/validators/inventory.validator.js';
import { imagePatchSchema, imageUploadFields } from '../../src/validators/verification.validator.js';
import { validateAiCriteria } from '../../src/domain/assistantCriteria.js';

test('master values accept generated-code inputs and amenity categories', () => {
  assert.equal(catalogCreateSchema.parse({ name: 'Heritage Haveli' }).name, 'Heritage Haveli');
  assert.equal(catalogCreateSchema.parse({ name: 'Private Jacuzzi', category: 'WELLNESS' }).category, 'WELLNESS');
  assert.equal(catalogCreateSchema.safeParse({ name: 'X' }).success, false);
  assert.equal(catalogCreateSchema.safeParse({ name: 'Jacuzzi', category: 'MADE_UP' }).success, false);
  assert.deepEqual(catalogCreateSchema.parse({ name: 'Smart TV', category: 'ROOM' }), { name: 'Smart TV', category: 'ROOM', sortOrder: 0 });
});

test('master updates require an actual change', () => {
  assert.equal(catalogUpdateSchema.safeParse({}).success, false);
  assert.equal(catalogUpdateSchema.parse({ isActive: false }).isActive, false);
});

test('bed types, image categories and meal plans are supported catalog kinds', () => {
  assert.ok(CATALOG_KINDS.includes('bed-types'));
  assert.ok(CATALOG_KINDS.includes('image-categories'));
  assert.ok(CATALOG_KINDS.includes('meal-plans'));
  assert.equal(catalogKindParam.parse({ kind: 'bed-types' }).kind, 'bed-types');
  assert.equal(catalogKindParam.parse({ kind: 'image-categories' }).kind, 'image-categories');
  assert.equal(catalogKindParam.parse({ kind: 'meal-plans' }).kind, 'meal-plans');
  const mealPlan = catalogCreateSchema.parse({ name: 'All inclusive', includesBreakfast: true, includesLunch: true, includesDinner: true });
  assert.equal(mealPlan.includesDinner, true);
});

test('rate-plan validation accepts dynamic meal-plan codes and rejects malformed ones', () => {
  const plan = {
    code: 'AI', name: 'All inclusive', mealPlan: 'ALL_INCLUSIVE', isRefundable: true,
    cancellationPolicyId: 1, discountPercent: 0, taxPercent: 12, feeMinor: 0,
  };
  assert.equal(ratePlanCreateSchema.parse(plan).mealPlan, 'ALL_INCLUSIVE');
  assert.equal(ratePlanCreateSchema.safeParse({ ...plan, mealPlan: 'not valid!' }).success, false);
});

test('room and image validators accept dynamic master codes while rejecting invalid code shapes', () => {
  const room = {
    name: 'Custom Bed Room', category: 'DELUXE', bedType: 'CALIFORNIA_KING', bedCount: 1,
    maxAdults: 2, maxChildren: 0, maxOccupancy: 2, smoking: 'NON_SMOKING', totalUnits: 1,
  };
  assert.equal(roomTypeCreateSchema.parse(room).bedType, 'CALIFORNIA_KING');
  assert.equal(roomTypeCreateSchema.safeParse({ ...room, bedType: 'not valid!' }).success, false);
  assert.equal(imagePatchSchema.parse({ category: 'ROOFTOP' }).category, 'ROOFTOP');
  assert.equal(imageUploadFields.parse({}).category, 'OTHER');
  assert.equal(imagePatchSchema.safeParse({ category: 'not valid!' }).success, false);
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
