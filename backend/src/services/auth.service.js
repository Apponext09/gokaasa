import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import { pool, withTransaction } from '../db/pool.js';
import { authRepository } from '../repositories/auth.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { tokenService } from './token.service.js';
import { mailService } from './mail.service.js';
import { AppError } from '../utils/AppError.js';
import { generateToken, hashToken } from '../utils/crypto.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('auth');
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

// Runs a bcrypt compare for unknown emails so login timing does not reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', config.auth.bcryptRounds);

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    roles: user.roles,
    isGuest: user.isGuest,
  };
}

async function issueSession(client, user, meta) {
  const refreshToken = generateToken();
  await authRepository.insertRefreshToken(client, {
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + config.auth.refreshTtlDays * DAY_MS),
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });
  return {
    accessToken: tokenService.signAccessToken(user),
    refreshToken,
    user: toPublicUser(user),
  };
}

export const authService = {
  async register(input, meta) {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) {
      throw AppError.conflict('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, config.auth.bcryptRounds);

    return withTransaction(async (client) => {
      const userId = await userRepository.create(client, {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        roleCode: 'CUSTOMER',
      });
      const user = await userRepository.findById(userId, client);
      return issueSession(client, user, meta);
    });
  },

  /**
   * Feature 2: lets a visitor book without creating an account or seeing a sign-up form. A real `users`
   * row is still required (bookings.user_id is NOT NULL, FK'd to users), so one is created -- or, for a
   * repeat guest checkout with the same email and no booking history yet, reused -- with an unusable
   * random password hash (never shared, never derivable). From here the guest is a completely ordinary
   * authenticated CUSTOMER: every existing ownership check, hold/payment/invoice/cancellation
   * path applies unchanged.
   *
   * SECURITY: an email is refused outright (never reused, never attached to) whenever it already has
   * real history to protect:
   *   - a REAL registered account (has its own password) -- refused so no one can book "as" that
   *     customer merely by knowing their email.
   *   - a GUEST account that has ever had a booking of any kind -- refused for the same reason: once
   *     there is real history (a trip, an attempted payment, PII), knowing the email is not proof of
   *     being that person, and reusing the account would hand a stranger that history with no password
   *     or verification at all.
   * An existing guest account is only reused while it is still genuinely empty (e.g. a same-visit retry
   * of an abandoned checkout form) -- the lowest-risk case, since nothing sensitive exists on it yet.
   * Setting a real password via the existing, email-verified "forgot password" flow (which also clears
   * is_guest, see userRepository#updatePassword) is the one secure way a guest later gets normal login
   * access to their own account and its bookings from another device.
   */
  async guestCheckout(input, meta) {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) {
      const hasRealHistory = !existing.isGuest || (await bookingRepository.hasAnyBooking(existing.id));
      if (hasRealHistory) {
        throw AppError.conflict(
          'An account already exists with this email. Please log in, or use "Forgot password" if you checked out as a guest before.',
        );
      }
      await userRepository.updateGuestContact(pool, existing.id, {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.mobile,
      });
      const refreshed = await userRepository.findById(existing.id);
      return withTransaction((client) => issueSession(client, refreshed, meta));
    }

    const passwordHash = await bcrypt.hash(generateToken(), config.auth.bcryptRounds);
    return withTransaction(async (client) => {
      const userId = await userRepository.create(client, {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.mobile,
        roleCode: 'CUSTOMER',
        isGuest: true,
      });
      const user = await userRepository.findById(userId, client);
      return issueSession(client, user, meta);
    });
  },

  async login(input, meta) {
    const user = await userRepository.findByEmail(input.email);
    const passwordOk = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !passwordOk || !user.isActive) {
      throw AppError.unauthorized('Invalid email or password');
    }

    const session = await withTransaction((client) => issueSession(client, user, meta));
    await userRepository.touchLastLogin(user.id);
    return session;
  },

  /**
   * Rotates a refresh token. Presenting an already-revoked token is treated as theft:
   * every session for that user is revoked and the client must sign in again.
   */
  async refresh(rawRefreshToken, meta) {
    if (!rawRefreshToken) throw AppError.unauthorized('Session not found. Please sign in.');

    // Errors are thrown outside the transaction so the reuse revocation below is committed, not rolled back.
    const outcome = await withTransaction(async (client) => {
      const stored = await authRepository.findRefreshTokenForUpdate(client, hashToken(rawRefreshToken));
      if (!stored) return { error: 'not_found' };

      if (stored.revoked_at) {
        log.warn('refresh token reuse detected; revoking all sessions', { userId: stored.user_id });
        await authRepository.revokeAllForUser(client, stored.user_id);
        return { error: 'reused' };
      }
      if (stored.expires_at <= new Date()) return { error: 'expired' };

      const user = await userRepository.findById(stored.user_id, client);
      if (!user || !user.isActive) return { error: 'not_found' };

      const session = await issueSession(client, user, meta);
      const replacement = await client.query(`SELECT id FROM refresh_tokens WHERE token_hash = $1`, [
        hashToken(session.refreshToken),
      ]);
      await authRepository.revokeRefreshToken(client, stored.id, replacement.rows[0].id);
      return { session };
    });

    switch (outcome.error) {
      case 'not_found':
        throw AppError.unauthorized('Session not found. Please sign in.');
      case 'expired':
        throw AppError.unauthorized('Your session has expired. Please sign in again.');
      case 'reused':
        throw AppError.unauthorized('Session was closed for your security. Please sign in again.');
      default:
        return outcome.session;
    }
  },

  async logout(rawRefreshToken) {
    if (!rawRefreshToken) return;
    await withTransaction(async (client) => {
      const stored = await authRepository.findRefreshTokenForUpdate(client, hashToken(rawRefreshToken));
      if (stored) await authRepository.revokeRefreshToken(client, stored.id);
    });
  },

  async requestPasswordReset(email) {
    const user = await userRepository.findByEmail(email);
    // Always succeed from the caller's point of view so attackers cannot discover registered emails.
    if (!user || !user.isActive) return;

    const token = generateToken();
    await withTransaction(async (client) => {
      await authRepository.invalidateResetTokens(client, user.id);
      await authRepository.insertResetToken(client, {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + config.auth.passwordResetTtlMinutes * MINUTE_MS),
      });
    });

    const resetUrl = `${config.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await mailService.send({
      to: user.email,
      subject: 'Reset your Gokaasa password',
      text: `Use this link to reset your password (valid for ${config.auth.passwordResetTtlMinutes} minutes):\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    });
  },

  async resetPassword({ token, password }) {
    await withTransaction(async (client) => {
      const reset = await authRepository.findResetTokenForUpdate(client, hashToken(token));
      if (!reset || reset.used_at || reset.expires_at <= new Date()) {
        throw AppError.badRequest('This reset link is invalid or has expired. Please request a new one.');
      }

      const passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds);
      await userRepository.updatePassword(client, reset.user_id, passwordHash);
      await authRepository.markResetTokenUsed(client, reset.id);
      // A password reset signs the user out everywhere.
      await authRepository.revokeAllForUser(client, reset.user_id);
    });
  },

  async getProfile(userId) {
    const user = await userRepository.findById(userId);
    if (!user || !user.isActive) throw AppError.unauthorized();
    return toPublicUser(user);
  },
};
