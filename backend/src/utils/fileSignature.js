import { detectImageType } from './imageSignature.js';

/**
 * Identifies a partner verification document by its leading bytes, never by the client's claimed
 * Content-Type or filename -- same principle as imageSignature.js. Accepts the same image formats
 * plus PDF, since verification documents (ID, registration, lease) are commonly scanned as either.
 * Newer image formats added to imageSignature.js (webp, avif) are deliberately excluded here -- this
 * document flow's accepted-types list is its own, unrelated to hotel/room photo uploads.
 */
const PDF_SIGNATURE = { mime: 'application/pdf', ext: 'pdf', test: (b) => b.length > 4 && b.subarray(0, 5).toString('ascii') === '%PDF-' };
const DOCUMENT_IMAGE_MIMES = new Set(['image/jpeg', 'image/png']);

export const ALLOWED_DOCUMENT_TYPES = Object.freeze([
  { mime: 'image/jpeg', ext: 'jpg' },
  { mime: 'image/png', ext: 'png' },
  { mime: 'application/pdf', ext: 'pdf' },
]);

/** @returns {{ mime: string, ext: string } | null} */
export function detectDocumentType(buffer) {
  if (PDF_SIGNATURE.test(buffer)) return { mime: PDF_SIGNATURE.mime, ext: PDF_SIGNATURE.ext };
  const image = detectImageType(buffer);
  return image && DOCUMENT_IMAGE_MIMES.has(image.mime) ? image : null;
}
