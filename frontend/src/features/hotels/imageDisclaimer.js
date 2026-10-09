/**
 * Phase 10A: an ILLUSTRATIVE image is a stand-in stock photo used only while a hotel's real property
 * photo is still pending -- never the actual building/rooms. These helpers decide when to say so.
 */

/** For a card's single cover image, shaped `{ url, altText, isIllustrative }` by the search API. */
export function isIllustrativeCover(image) {
  return Boolean(image?.isIllustrative);
}

/**
 * For the hotel-detail gallery, where every image carries its own `imageType`. The page-level notice
 * only appears when every available photo is illustrative -- one real photo is enough to drop it,
 * since the guest is no longer seeing only stand-in images.
 */
export function isAllIllustrative(images) {
  return Boolean(images?.length) && images.every((image) => image?.imageType === 'ILLUSTRATIVE');
}

export function isIllustrativeImage(image) {
  return image?.imageType === 'ILLUSTRATIVE';
}
