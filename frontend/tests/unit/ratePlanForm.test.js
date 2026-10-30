import test from 'node:test';
import assert from 'node:assert/strict';
import { ratePlanFormSchema, toRatePlanPayload } from '../../src/features/rooms/roomForm.js';

const valid = {
  code: 'ROOM_ONLY',
  name: 'Room only',
  description: '',
  mealPlan: 'ROOM_ONLY',
  isRefundable: true,
  cancellationPolicyId: '7',
  discountPercent: '10',
  taxPercent: '12',
  feeRupees: '150',
  basePriceRupees: '8999.50',
  status: 'ACTIVE',
};

test('a rate plan requires one permanent nightly price and sends it in paise', () => {
  assert.equal(ratePlanFormSchema.safeParse(valid).success, true);
  assert.equal(toRatePlanPayload(valid).basePriceMinor, 899950);
});

test('a missing or zero permanent nightly price is rejected', () => {
  assert.equal(ratePlanFormSchema.safeParse({ ...valid, basePriceRupees: '' }).success, false);
  assert.equal(ratePlanFormSchema.safeParse({ ...valid, basePriceRupees: '0' }).success, false);
});
