import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllIllustrative, isIllustrativeCover, isIllustrativeImage } from '../../src/features/hotels/imageDisclaimer.js';

test('isIllustrativeCover flags a card whose single cover image is illustrative', () => {
  assert.equal(isIllustrativeCover({ url: 'x', isIllustrative: true }), true);
});

test('isIllustrativeCover is false for a real-property cover, and safe with no image at all', () => {
  assert.equal(isIllustrativeCover({ url: 'x', isIllustrative: false }), false);
  assert.equal(isIllustrativeCover(null), false);
  assert.equal(isIllustrativeCover(undefined), false);
});

test('isAllIllustrative is true only when every gallery image is illustrative', () => {
  assert.equal(isAllIllustrative([{ imageType: 'ILLUSTRATIVE' }]), true);
  assert.equal(isAllIllustrative([{ imageType: 'ILLUSTRATIVE' }, { imageType: 'ILLUSTRATIVE' }]), true);
});

test('isAllIllustrative drops to false the moment one real photo is in the gallery (mixed gallery)', () => {
  assert.equal(isAllIllustrative([{ imageType: 'ILLUSTRATIVE' }, { imageType: 'REAL_PROPERTY' }]), false);
  assert.equal(isAllIllustrative([{ imageType: 'REAL_PROPERTY' }]), false);
});

test('isAllIllustrative is false for an empty or missing gallery -- no images is not "all illustrative"', () => {
  assert.equal(isAllIllustrative([]), false);
  assert.equal(isAllIllustrative(undefined), false);
  assert.equal(isAllIllustrative(null), false);
});

test('isIllustrativeImage labels each gallery image by its own type, independent of the others', () => {
  assert.equal(isIllustrativeImage({ imageType: 'ILLUSTRATIVE' }), true);
  assert.equal(isIllustrativeImage({ imageType: 'REAL_PROPERTY' }), false);
  assert.equal(isIllustrativeImage({}), false);
  assert.equal(isIllustrativeImage(undefined), false);
});
