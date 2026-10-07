import { createHash, randomBytes } from 'node:crypto';

/** URL-safe random token. Only the hash is persisted, never the raw value. */
export function generateToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
