import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSubmitMessage } from '../../src/features/support/messageComposer.js';

/**
 * Regression coverage for the Enter-key duplicate-submission fix: MessageComposer.jsx's Send button
 * and its Enter-key handler both now call this same predicate, so these cases cover both paths at once.
 */

test('a non-empty message while idle may submit', () => {
  assert.equal(canSubmitMessage({ submitting: false, value: 'A resort in Goa' }), true);
});

test('a request already in flight must never submit again, even with valid text', () => {
  assert.equal(canSubmitMessage({ submitting: true, value: 'A resort in Goa' }), false);
});

test('an empty message may never submit', () => {
  assert.equal(canSubmitMessage({ submitting: false, value: '' }), false);
});

test('a whitespace-only message may never submit', () => {
  assert.equal(canSubmitMessage({ submitting: false, value: '   \n\t  ' }), false);
});

test('submitting and empty at the same time is still blocked (both conditions independently gate submission)', () => {
  assert.equal(canSubmitMessage({ submitting: true, value: '' }), false);
});

test('a missing/undefined value is treated the same as empty, never throws', () => {
  assert.equal(canSubmitMessage({ submitting: false, value: undefined }), false);
});
