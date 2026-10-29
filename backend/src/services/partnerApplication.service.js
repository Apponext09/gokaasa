import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import { pool, withTransaction } from '../db/pool.js';
import { userRepository } from '../repositories/user.repository.js';
import { partnerProfileRepository } from '../repositories/partnerProfile.repository.js';
import { partnerDocumentRepository } from '../repositories/partnerDocument.repository.js';
import { otpService } from '../otp/otpService.js';
import { issueSession } from './auth.service.js';
import { auditService } from './audit.service.js';
import { getPrivateStorage } from '../storage/privateStorage.js';
import { detectDocumentType } from '../utils/fileSignature.js';
import { PARTNER_ACTION, resolveTransition } from '../domain/partnerApplicationStatus.js';
import { notificationService } from '../notifications/notificationService.js';
import { emailNotificationService } from './emailNotification.service.js';
import { toPage } from './presenters.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('partner-application');
const OTP_PURPOSE = 'PARTNER_EMAIL_VERIFY';

// A submission must include at least proof of business and proof of identity. PROPERTY_OWNERSHIP_OR_LEASE
// and OTHER stay optional in Phase 1 -- not every property type can supply them at this stage.
const REQUIRED_DOC_TYPES = ['BUSINESS_REGISTRATION', 'GOVERNMENT_ID'];

function withDocuments(profile, documents) {
  return { ...profile, documents };
}

export const partnerApplicationService = {
  async register(input) {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) {
      // A HOTEL_OWNER account that never completed email verification is not a real duplicate -- it's
      // an abandoned or SMTP-interrupted attempt (see otpService.issue). Resume it with a fresh code
      // instead of blocking the applicant behind a 409 they have no way to recover from.
      if (existing.roles.includes('HOTEL_OWNER') && !existing.emailVerifiedAt) {
        await otpService.issue(existing, OTP_PURPOSE);
        return { email: existing.email };
      }
      throw AppError.conflict('An account with this email already exists. Please log in, or use a different email to register as a partner.');
    }

    const passwordHash = await bcrypt.hash(input.password, config.auth.bcryptRounds);
    const user = await withTransaction(async (client) => {
      const userId = await userRepository.create(client, {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.mobile,
        roleCode: 'HOTEL_OWNER',
      });
      await partnerProfileRepository.create(client, {
        userId,
        businessName: input.businessName,
        businessType: input.businessType,
        gstin: input.gstin,
        pan: input.pan,
        contactPhone: input.mobile,
        propertyName: input.propertyName,
        propertyCity: input.propertyCity,
        propertyAddress: input.propertyAddress,
        estimatedRooms: input.estimatedRooms,
      });
      await auditService.record(client, {
        actor: { id: userId },
        action: 'partner.registered',
        entity: 'partner',
        entityId: userId,
        newValue: { email: input.email, businessName: input.businessName },
      });
      return userRepository.findById(userId, client);
    });

    await otpService.issue(user, OTP_PURPOSE);
    return { email: user.email };
  },

  /** Always succeeds from the caller's point of view, same reasoning as auth.service.js's password reset. */
  async resendOtp(email) {
    const user = await userRepository.findByEmail(email);
    if (!user || !user.roles.includes('HOTEL_OWNER') || user.emailVerifiedAt) return;
    await otpService.issue(user, OTP_PURPOSE);
  },

  /**
   * Verifies the OTP and, on success, issues a normal session -- the same session shape login/register
   * issue, via auth.service.js's exported `issueSession`. Only valid before the account's first
   * verification: once `emailVerifiedAt` is set, this endpoint refuses rather than becoming a
   * password-free login for anyone who can guess a 6-digit code against a known email.
   */
  async verifyOtp({ email, code }, meta) {
    const user = await userRepository.findByEmail(email);
    if (!user || !user.roles.includes('HOTEL_OWNER')) throw AppError.badRequest('Incorrect code. Please try again.');
    if (user.emailVerifiedAt) throw AppError.badRequest('This account is already verified. Please log in.');

    await otpService.verify(user, OTP_PURPOSE, code);
    await userRepository.markEmailVerified(pool, user.id);
    const verified = await userRepository.findById(user.id);
    return withTransaction((client) => issueSession(client, verified, meta));
  },

  /**
   * Validates the real file bytes (never the client's claimed type), stores them in the private
   * storage root (never the publicly-served MEDIA_DIR), and records the row. Mirrors
   * hotelImage.service.js's storeAndInsertImage: store first, roll back storage on a DB failure.
   */
  async uploadDocument(userId, file, { docType }, actor) {
    if (!file?.buffer?.length) throw AppError.badRequest('Choose a file to upload');

    const detected = detectDocumentType(file.buffer);
    if (!detected) throw AppError.unsupportedMediaType('Only JPEG, PNG or PDF files are accepted');

    const contentHash = createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = `partner-docs/${userId}/${randomUUID()}.${detected.ext}`;
    const storage = getPrivateStorage();
    await storage.put(storageKey, file.buffer);

    try {
      const id = await withTransaction(async (client) => {
        const insertedId = await partnerDocumentRepository.insert(client, {
          userId,
          docType,
          storageKey,
          mimeType: detected.mime,
          byteSize: file.buffer.length,
          contentHash,
        });
        await auditService.record(client, {
          actor,
          action: 'partner.document_uploaded',
          entity: 'partner',
          entityId: userId,
          newValue: { docId: insertedId, docType, byteSize: file.buffer.length },
        });
        return insertedId;
      });
      return { id, docType, mimeType: detected.mime, byteSize: file.buffer.length };
    } catch (error) {
      await storage.remove(storageKey).catch((cleanupError) => log.error('orphan cleanup failed', { storageKey, message: cleanupError.message }));
      throw error;
    }
  },

  async getMyApplication(userId) {
    const profile = await partnerProfileRepository.findByUserId(userId);
    if (!profile) throw AppError.notFound('Application not found');
    return withDocuments(profile, await partnerDocumentRepository.listForUser(userId));
  },

  async submit(userId, actor) {
    const profile = await partnerProfileRepository.findByUserId(userId);
    if (!profile) throw AppError.notFound('Application not found');

    const nextStatus = resolveTransition(profile.status, PARTNER_ACTION.SUBMIT);
    if (!nextStatus) throw AppError.conflict(`Cannot submit an application that is ${profile.status.toLowerCase().replaceAll('_', ' ')}`);

    const documents = await partnerDocumentRepository.listForUser(userId);
    const uploadedTypes = new Set(documents.map((doc) => doc.docType));
    const missing = REQUIRED_DOC_TYPES.filter((docType) => !uploadedTypes.has(docType));
    if (missing.length > 0) {
      throw AppError.unprocessable(
        'Upload the required documents before submitting',
        missing.map((docType) => ({ field: 'documents', message: `${docType} is required` })),
      );
    }

    await withTransaction(async (client) => {
      await partnerProfileRepository.markSubmitted(client, userId);
      await auditService.record(client, { actor, action: 'partner.submitted', entity: 'partner', entityId: userId });
    });
    notificationService.sendPartnerApplicationSubmitted({ id: userId, businessName: profile.businessName }).catch(() => {});
    return this.getMyApplication(userId);
  },

  async listForAdmin(query) {
    const { total, rows } = await partnerProfileRepository.listForAdmin(query);
    return toPage(rows, total, query.page, query.limit);
  },

  async getForAdmin(userId) {
    const profile = await partnerProfileRepository.findByUserId(userId);
    if (!profile) throw AppError.notFound('Partner application not found');
    return withDocuments(profile, await partnerDocumentRepository.listForUser(userId));
  },

  async approve(userId, actor) {
    const profile = await partnerProfileRepository.findByUserId(userId);
    if (!profile) throw AppError.notFound('Partner application not found');

    const nextStatus = resolveTransition(profile.status, PARTNER_ACTION.APPROVE);
    if (!nextStatus) throw AppError.conflict(`Cannot approve an application that is ${profile.status.toLowerCase().replaceAll('_', ' ')}`);

    const eventKey = `partner.approved:${userId}:${Date.now()}`;
    await withTransaction(async (client) => {
      await partnerProfileRepository.markReviewed(client, userId, { status: 'APPROVED', reviewedBy: actor.id });
      const user = await userRepository.findById(userId, client);
      await emailNotificationService.enqueuePartnerDecision(client, user, { approved: true, eventKey });
      await auditService.record(client, { actor, action: 'partner.approved', entity: 'partner', entityId: userId });
    });
    await emailNotificationService.processEvent(eventKey);
    notificationService.sendPartnerApplicationApproved(userId).catch(() => {});
    return this.getForAdmin(userId);
  },

  async reject(userId, reason, actor) {
    if (!reason) throw AppError.badRequest('Provide a reason for the applicant');
    const profile = await partnerProfileRepository.findByUserId(userId);
    if (!profile) throw AppError.notFound('Partner application not found');

    const nextStatus = resolveTransition(profile.status, PARTNER_ACTION.REJECT);
    if (!nextStatus) throw AppError.conflict(`Cannot reject an application that is ${profile.status.toLowerCase().replaceAll('_', ' ')}`);

    const eventKey = `partner.rejected:${userId}:${Date.now()}`;
    await withTransaction(async (client) => {
      await partnerProfileRepository.markReviewed(client, userId, { status: 'REJECTED', reviewedBy: actor.id, rejectionReason: reason });
      const user = await userRepository.findById(userId, client);
      await emailNotificationService.enqueuePartnerDecision(client, user, { approved: false, reason, eventKey });
      await auditService.record(client, { actor, action: 'partner.rejected', entity: 'partner', entityId: userId, newValue: { reason } });
    });
    await emailNotificationService.processEvent(eventKey);
    notificationService.sendPartnerApplicationRejected(userId, reason).catch(() => {});
    return this.getForAdmin(userId);
  },
};
