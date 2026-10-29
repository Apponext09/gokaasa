/**
 * Identifies an image by its leading bytes rather than trusting the client's Content-Type or filename.
 * Only formats listed here are accepted anywhere in the application.
 */
const SIGNATURES = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: 'png',
    test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    test: (b) => b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    // ISO-BMFF container: a 4-byte box size, then 'ftyp', then a 4-byte major brand and a list of
    // 4-byte compatible brands. Real-world encoders put 'avif'/'avis' in either slot (some use a
    // generic MIAF major brand like 'mif1' and list 'avif' only as a compatible brand), so this scans
    // the brand region rather than only the major-brand bytes.
    mime: 'image/avif',
    ext: 'avif',
    test: (b) => b.length > 12 && b.subarray(4, 8).toString('ascii') === 'ftyp' && /avif|avis/.test(b.subarray(8, Math.min(b.length, 32)).toString('ascii')),
  },
];

export const ALLOWED_IMAGE_TYPES = Object.freeze(SIGNATURES.map(({ mime, ext }) => ({ mime, ext })));

/** @returns {{ mime: string, ext: string } | null} */
export function detectImageType(buffer) {
  const match = SIGNATURES.find((signature) => signature.test(buffer));
  return match ? { mime: match.mime, ext: match.ext } : null;
}
