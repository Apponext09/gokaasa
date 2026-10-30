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
import { partnerProfileRepository } from '../repositories/partnerProfile.repository.js';
import { emailNotificationService } from './emailNotification.service.js';
import { renderEmail } from '../email/templates.js';

const log = createLogger('auth');
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

// Runs a bcrypt compare for unknown emails so login timing does not reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', config.auth.bcryptRounds);

// Only a HOTEL_OWNER has a partner_profiles row; everyone else gets partnerStatus: null, which the
// frontend treats as "not a partner, nothing to route around".
async function toPublicUser(user) {
  const partnerStatus = user.roles.includes('HOTEL_OWNER') ? await partnerProfileRepository.statusForUser(user.id) : null;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    roles: user.roles,
    isGuest: user.isGuest,
    partnerStatus,
  };
}

/**
 * Issues a session (access + refresh token) for an already-authenticated user. Exported so the partner
 * self-service OTP-verification flow (services/partnerApplication.service.js) can issue a normal session
 * the same way login/register do, without duplicating refresh-token/JWT logic.
 */
export async function issueSession(client, user, meta) {
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
    user: await toPublicUser(user),
  };
}

export const authService = {
  async register(input, meta) {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) {
      throw AppError.conflict('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, config.auth.bcryptRounds);

    const result = await withTransaction(async (client) => {
      const userId = await userRepository.create(client, {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        roleCode: 'CUSTOMER',
      });
      const user = await userRepository.findById(userId, client);
      await emailNotificationService.enqueueWelcome(client, user);
      return { session: await issueSession(client, user, meta), eventKey: `customer.registered:${user.id}` };
    });
    await emailNotificationService.processEvent(result.eventKey);
    return result.session;
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
        const message = 'This email is already registered. Please log in, or use "Forgot password" to access the account.';
        throw AppError.conflict(
          message,
          [{ field: 'body.email', message }],
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
    const support = await pool.query(`SELECT value FROM platform_settings WHERE key = 'support_email'`);
    const message = renderEmail('passwordReset', {
      resetUrl, ttlMinutes: config.auth.passwordResetTtlMinutes,
      supportEmail: config.mail.supportEmail || support.rows[0]?.value || null,
    });
    // Public response remains generic even if SMTP is temporarily unavailable. A later request creates a
    // fresh one-time token; raw reset tokens are never persisted in the email outbox or logged.
    await mailService.send({ to: user.email, ...message }).catch((error) => {
      log.error('password reset email failed', { userId: user.id, message: error.message });
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

  async googleLogin(input, meta) {
    const { credential, accessToken } = input;
    if (!credential && !accessToken) {
      throw AppError.badRequest('Google credential or accessToken is required');
    }

    let profile;
    try {
      if (credential) {
        const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
        if (!response.ok) {
          throw new Error('Google token verification failed');
        }
        profile = await response.json();
      } else {
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) {
          throw new Error('Google userinfo fetch failed');
        }
        profile = await response.json();
      }
    } catch (err) {
      log.warn('Google authentication verification failed', { error: err.message });
      throw AppError.unauthorized('Invalid or expired Google authentication');
    }

    const email = profile.email?.toLowerCase().trim();
    const emailVerified = profile.email_verified === 'true' || profile.email_verified === true;
    if (!email || !emailVerified) {
      throw AppError.unauthorized('Google account email is not verified');
    }

    if (config.auth.googleClientId && profile.aud && profile.aud !== config.auth.googleClientId) {
      throw AppError.unauthorized('Google token audience mismatch');
    }

    let user = await userRepository.findByEmail(email);

    if (user) {
      if (!user.isActive) {
        throw AppError.unauthorized('This account has been deactivated. Please contact support.');
      }
      await userRepository.touchLastLogin(user.id);
    } else {
      const firstName = (profile.given_name || profile.name?.split(' ')[0] || 'User').trim().slice(0, 80);
      const lastName = (profile.family_name || profile.name?.split(' ').slice(1).join(' ') || 'Customer').trim().slice(0, 80);
      const unusablePasswordHash = await bcrypt.hash(`google-oauth-${Date.now()}-${Math.random()}`, config.auth.bcryptRounds);

      const result = await withTransaction(async (client) => {
        const id = await userRepository.create(client, {
          email,
          passwordHash: unusablePasswordHash,
          firstName: firstName || 'User',
          lastName: lastName || 'Customer',
          roleCode: 'CUSTOMER',
        });
        await client.query(`UPDATE users SET email_verified_at = now() WHERE id = $1`, [id]);
        const createdUser = await userRepository.findById(id, client);
        await emailNotificationService.enqueueWelcome(client, createdUser);
        return { user: createdUser, eventKey: `customer.registered:${id}` };
      });
      user = result.user;
      await emailNotificationService.processEvent(result.eventKey);
    }

    const session = await withTransaction((client) => issueSession(client, user, meta));
    return session;
  },
};
