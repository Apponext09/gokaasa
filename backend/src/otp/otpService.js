import { randomInt } from 'node:crypto';
import { withTransaction } from '../db/pool.js';
import { config } from '../config/index.js';
import { otpRepository } from '../repositories/otp.repository.js';
import { hashToken } from '../utils/crypto.js';
import { emailOtpChannel } from './emailOtpChannel.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('otp');
const MINUTE_MS = 60 * 1000;

function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export const otpService = {
  /**
   * Invalidates any prior unconsumed code for this purpose and issues a fresh one. The code is
   * authoritative in the database the moment this returns; the email is a best-effort delivery of it,
   * same philosophy as auth.service.js's welcome email. A provider/SMTP failure here must not undo the
   * registration that already committed, and must not be mistaken for the OTP itself failing to issue --
   * it is logged for ops and the caller can always get a fresh attempt via resend-otp.
   */
  async issue(user, purpose) {
    const code = generateCode();
    await withTransaction(async (client) => {
      await otpRepository.invalidateActive(client, user.id, purpose);
      await otpRepository.insert(client, {
        userId: user.id,
        purpose,
        codeHash: hashToken(code),
        expiresAt: new Date(Date.now() + config.partner.otpTtlMinutes * MINUTE_MS),
      });
    });
    try {
      await emailOtpChannel.send(user, code, { ttlMinutes: config.partner.otpTtlMinutes });
    } catch (error) {
      log.error('failed to deliver OTP email', { userId: user.id, purpose, message: error.message });
    }
  },

  /**
   * Verifies a code for this purpose. Wrong codes count against OTP_MAX_ATTEMPTS (independent of the
   * IP-based otpLimiter) so a 6-digit code cannot be brute-forced merely by spreading guesses across IPs.
   */
  async verify(user, purpose, code) {
    await withTransaction(async (client) => {
      const row = await otpRepository.findActiveForUpdate(client, user.id, purpose);
      if (!row) throw AppError.badRequest('No verification code is pending. Request a new one.');
      if (row.expires_at <= new Date()) throw AppError.badRequest('This code has expired. Request a new one.');
      if (row.attempts >= config.partner.otpMaxAttempts) {
        throw AppError.badRequest('Too many incorrect attempts. Request a new code.');
      }
      if (row.code_hash !== hashToken(code)) {
        await otpRepository.incrementAttempts(client, row.id);
        throw AppError.badRequest('Incorrect code. Please try again.');
      }
      await otpRepository.markConsumed(client, row.id);
    });
  },
};
