import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import { withTransaction } from '../db/pool.js';
import { authRepository } from '../repositories/auth.repository.js';
import { emailChangeRepository } from '../repositories/emailChange.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { renderEmail } from '../email/templates.js';
import { hashToken } from '../utils/crypto.js';
import { AppError } from '../utils/AppError.js';
import { auditService } from './audit.service.js';
import { mailService } from './mail.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('email-change');
const MINUTE_MS = 60 * 1000;
const STAFF_ROLES = new Set([
  'ADMIN',
  'HOTEL_MANAGER',
  'HOTEL_OWNER',
  'SALES_EXECUTIVE',
  'HOTEL_ONBOARDING_EXECUTIVE',
  'HOTEL_REVIEW_EXECUTIVE',
]);

function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function assertStaff(user) {
  if (!user?.isActive) throw AppError.unauthorized();
  if (!user.roles.some((role) => STAFF_ROLES.has(role))) {
    throw AppError.forbidden('Email changes are available to staff accounts only');
  }
}

function expiresAt() {
  return new Date(Date.now() + config.partner.otpTtlMinutes * MINUTE_MS);
}

function toPending(row) {
  if (!row) return null;
  return {
    newEmail: row.new_email,
    expiresAt: row.expires_at,
    expired: row.expires_at <= new Date(),
  };
}

async function sendCode(newEmail, code) {
  const message = renderEmail('emailChangeCode', {
    code,
    ttlMinutes: config.partner.otpTtlMinutes,
    supportEmail: config.mail.supportEmail,
  });
  try {
    await mailService.send({ to: newEmail, ...message });
  } catch (error) {
    log.error('email change verification delivery failed', { message: error.message });
    throw AppError.serviceUnavailable('We could not send the verification code. Please try again.');
  }
}

export const emailChangeService = {
  async pending(userId) {
    const user = await userRepository.findById(userId);
    assertStaff(user);
    return toPending(await emailChangeRepository.findActive(userId));
  },

  async request(userId, { newEmail, currentPassword }) {
    const user = await userRepository.findById(userId);
    assertStaff(user);

    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw AppError.badRequest('Current password is incorrect');
    }
    if (newEmail.toLowerCase() === user.email.toLowerCase()) {
      throw AppError.conflict('This is already your current email address');
    }
    if (await userRepository.findByEmail(newEmail)) {
      throw AppError.conflict('An account with this email already exists');
    }

    const code = generateCode();
    const row = await withTransaction(async (client) => {
      await emailChangeRepository.cancelActive(client, userId);
      return emailChangeRepository.create(client, {
        userId,
        newEmail,
        codeHash: hashToken(code),
        expiresAt: expiresAt(),
      });
    });
    await sendCode(row.new_email, code);
    return toPending(row);
  },

  async resend(userId) {
    const user = await userRepository.findById(userId);
    assertStaff(user);
    const code = generateCode();
    const row = await withTransaction(async (client) => {
      const pending = await emailChangeRepository.findActiveForUpdate(client, userId);
      if (!pending) throw AppError.badRequest('No email change is pending');
      if (await userRepository.findByEmail(pending.new_email, client)) {
        throw AppError.conflict('An account with this email already exists');
      }
      return emailChangeRepository.replaceCode(client, pending.id, {
        codeHash: hashToken(code),
        expiresAt: expiresAt(),
      });
    });
    await sendCode(row.new_email, code);
    return toPending(row);
  },

  async verify(userId, code, actor) {
    let outcome;
    try {
      outcome = await withTransaction(async (client) => {
        const user = await userRepository.findById(userId, client);
        assertStaff(user);
        const pending = await emailChangeRepository.findActiveForUpdate(client, userId);
        if (!pending) return { error: 'missing' };
        if (pending.expires_at <= new Date()) return { error: 'expired' };
        if (pending.attempts >= config.partner.otpMaxAttempts) return { error: 'attempts' };
        if (pending.code_hash !== hashToken(code)) {
          await emailChangeRepository.incrementAttempts(client, pending.id);
          return { error: 'incorrect' };
        }

        const existing = await userRepository.findByEmail(pending.new_email, client);
        if (existing && existing.id !== user.id) return { error: 'duplicate' };

        await userRepository.updateEmail(client, user.id, pending.new_email);
        await emailChangeRepository.markConsumed(client, pending.id);
        await authRepository.revokeAllForUser(client, user.id);
        await auditService.record(client, {
          actor,
          action: 'user.email_changed',
          entity: 'user',
          entityId: user.id,
          oldValue: { email: user.email },
          newValue: { email: pending.new_email },
        });
        return { oldEmail: user.email, newEmail: pending.new_email };
      });
    } catch (error) {
      if (error.code === '23505') throw AppError.conflict('An account with this email already exists');
      throw error;
    }

    const errors = {
      missing: 'No email change is pending. Request a new code.',
      expired: 'This code has expired. Request a new one.',
      attempts: 'Too many incorrect attempts. Request a new code.',
      incorrect: 'Incorrect code. Please try again.',
      duplicate: 'An account with this email already exists',
    };
    if (outcome.error) {
      if (outcome.error === 'duplicate') throw AppError.conflict(errors[outcome.error]);
      throw AppError.badRequest(errors[outcome.error]);
    }

    const notice = renderEmail('emailChanged', {
      newEmail: outcome.newEmail,
      supportEmail: config.mail.supportEmail,
    });
    mailService.send({ to: outcome.oldEmail, ...notice }).catch((error) => {
      log.error('old-email security notice failed', { userId, message: error.message });
    });
    return { email: outcome.newEmail };
  },

  async cancel(userId) {
    const user = await userRepository.findById(userId);
    assertStaff(user);
    await withTransaction((client) => emailChangeRepository.cancelActive(client, userId));
  },
};
