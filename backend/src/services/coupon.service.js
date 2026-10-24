import { randomUUID } from 'node:crypto';
import { pool, withTransaction } from '../db/pool.js';
import { couponRepository } from '../repositories/coupon.repository.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { discountFor, eligibilityErrors } from '../domain/coupon.js';
import { isHoldLive, HOLD_STATUS } from '../domain/holdStatus.js';
import { AppError } from '../utils/AppError.js';
import { auditService } from './audit.service.js';
import { toPage } from './presenters.js';
import { getStorage } from '../storage/index.js';
import { detectImageType } from '../utils/imageSignature.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('coupon-images');

function toCouponRow(row) {
  return {
    id: row.id,
    code: row.code,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    maxDiscountMinor: row.max_discount_minor == null ? null : Number(row.max_discount_minor),
    minAmountMinor: Number(row.min_amount_minor),
    validFrom: row.valid_from,
    validTo: row.valid_to,
    usageLimit: row.usage_limit,
    usedCount: row.used_count,
    isActive: row.is_active,
    perUserLimit: row.per_user_limit,
    minNights: row.min_nights,
    customerEligibility: row.customer_eligibility,
    stayFrom: row.stay_from,
    stayTo: row.stay_to,
    description: row.description,
    imageUrl: row.image_storage_key ? getStorage().publicUrl(row.image_storage_key) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Normalizes a code exactly the way the DB's CHECK constraint expects it: uppercase, trimmed. */
function normalizeCode(code) {
  return code.trim().toUpperCase();
}

const rupees = (minor) => Math.round(Number(minor)) / 100;

/**
 * Customer-facing view of a coupon: never the admin fields (created_by, used_count, usage_limit, the
 * internal usage ledger). Money is shown in rupees here, matching every other customer-facing price on
 * the site -- the admin API this is derived from stays in minor units, unchanged.
 */
function toPublicCoupon(row, hotels = [], cities = []) {
  const title = row.discount_type === 'PERCENT'
    ? `${Number(row.discount_value)}% Off Your Stay`
    : `₹${rupees(row.discount_value)} Off Your Stay`;
  return {
    id: row.id,
    code: row.code,
    title,
    description: row.description || `Save on your next stay with code ${row.code}.`,
    imageUrl: row.image_storage_key ? getStorage().publicUrl(row.image_storage_key) : null,
    discountType: row.discount_type,
    discountValue: row.discount_type === 'PERCENT' ? Number(row.discount_value) : rupees(row.discount_value),
    maxDiscount: row.max_discount_minor == null ? null : rupees(row.max_discount_minor),
    minBookingAmount: rupees(row.min_amount_minor),
    minNights: row.min_nights,
    validFrom: row.valid_from,
    validUntil: row.valid_to,
    eligibility: row.customer_eligibility,
    hotels,
    destinations: cities,
  };
}

async function requireOwnedHold(client, userId, holdId) {
  const hold = await bookingRepository.lockHold(holdId, client);
  if (!hold || hold.user_id !== userId) throw AppError.notFound('Hold not found');
  return hold;
}

async function resolveRestrictionFlags(coupon, hold, client) {
  const hotelIds = await couponRepository.hotelIds(coupon.id, client);
  const cities = await couponRepository.cities(coupon.id, client);
  const hotelAllowed = hotelIds.length === 0 || hotelIds.includes(Number(hold.hotel_id));
  const hotelCity = hold.quote_snapshot?.hotel?.city ?? null;
  const destinationAllowed = cities.length === 0 || (hotelCity != null && cities.some((c) => c.toLowerCase() === hotelCity.toLowerCase()));
  return { hotelAllowed, destinationAllowed };
}

async function resolveEligibility(client, coupon, hold, userId, { preCouponTotal }) {
  // Sequential, not Promise.all: these all run on the same transaction client, which can only run one
  // query at a time (pg deprecates and will reject concurrent queries on one client/connection).
  const usageCount = await couponRepository.activeUsageCountForUser(coupon.id, userId, client);
  const isPriorCustomer = await couponRepository.hasPriorConfirmedBooking(userId, client);
  const { hotelAllowed, destinationAllowed } = await resolveRestrictionFlags(coupon, hold, client);
  return eligibilityErrors(coupon, {
    now: new Date(),
    totalMinor: preCouponTotal,
    nights: hold.nights,
    checkIn: hold.check_in,
    checkOut: hold.check_out,
    isNewCustomer: !isPriorCustomer,
    hotelAllowed,
    destinationAllowed,
    usageLimitReached: coupon.usage_limit != null && coupon.used_count >= coupon.usage_limit,
    perUserLimitReached: coupon.per_user_limit != null && usageCount >= coupon.per_user_limit,
  });
}

export const couponService = {
  // ---- admin management, ADMIN-only (enforced at the route) -------------------------------------------

  async list(query) {
    const { rows, total } = await couponRepository.list(query);
    return toPage(rows.map(toCouponRow), total, query.page, query.limit);
  },

  async detail(id) {
    const row = await couponRepository.findById(id);
    if (!row) throw AppError.notFound('Coupon not found');
    const [hotelIds, cities, stats, recent] = await Promise.all([
      couponRepository.hotelIds(id),
      couponRepository.cities(id),
      couponRepository.usageStats(id),
      couponRepository.recentUsages(id),
    ]);
    return {
      ...toCouponRow(row),
      hotelIds,
      cities,
      usage: {
        confirmedCount: stats.confirmed_count,
        pendingCount: stats.pending_count,
        totalDiscountMinor: Number(stats.total_discount_minor),
      },
      recentUsages: recent.map((u) => ({
        id: u.id,
        status: u.status,
        discountMinor: Number(u.discount_minor),
        createdAt: u.created_at,
        customerName: [u.first_name, u.last_name].filter(Boolean).join(' '),
        customerEmail: u.email,
        bookingId: u.booking_id,
        bookingRef: u.booking_ref,
      })),
    };
  },

  async create(body, actor) {
    const id = await withTransaction(async (client) => {
      const id = await couponRepository.insert(client, {
        code: normalizeCode(body.code),
        discount_type: body.discountType,
        discount_value: body.discountValue,
        max_discount_minor: body.maxDiscountMinor ?? null,
        min_amount_minor: body.minAmountMinor ?? 0,
        valid_from: body.validFrom,
        valid_to: body.validTo,
        usage_limit: body.usageLimit ?? null,
        per_user_limit: body.perUserLimit ?? null,
        min_nights: body.minNights ?? null,
        customer_eligibility: body.customerEligibility ?? 'ALL',
        stay_from: body.stayFrom ?? null,
        stay_to: body.stayTo ?? null,
        description: body.description ?? null,
        created_by: actor.id,
      });
      await couponRepository.setRestrictions(client, id, { hotelIds: body.hotelIds ?? [], cities: body.cities ?? [] });
      await auditService.record(client, { actor, action: 'coupon.created', entity: 'coupon', entityId: id, newValue: { code: normalizeCode(body.code) } });
      return id;
    });
    return this.detail(id);
  },

  async update(id, body, actor) {
    await withTransaction(async (client) => {
      const existing = await couponRepository.findById(id, client);
      if (!existing) throw AppError.notFound('Coupon not found');
      const values = {};
      const map = {
        code: body.code !== undefined ? normalizeCode(body.code) : undefined,
        discount_type: body.discountType,
        discount_value: body.discountValue,
        max_discount_minor: body.maxDiscountMinor,
        min_amount_minor: body.minAmountMinor,
        valid_from: body.validFrom,
        valid_to: body.validTo,
        usage_limit: body.usageLimit,
        per_user_limit: body.perUserLimit,
        min_nights: body.minNights,
        customer_eligibility: body.customerEligibility,
        stay_from: body.stayFrom,
        stay_to: body.stayTo,
        description: body.description,
      };
      for (const [key, value] of Object.entries(map)) {
        if (value !== undefined) values[key] = value;
      }
      await couponRepository.update(client, id, values);
      if (body.hotelIds !== undefined || body.cities !== undefined) {
        await couponRepository.setRestrictions(client, id, { hotelIds: body.hotelIds ?? [], cities: body.cities ?? [] });
      }
      await auditService.record(client, { actor, action: 'coupon.updated', entity: 'coupon', entityId: id, oldValue: { code: existing.code }, newValue: body });
    });
    return this.detail(id);
  },

  async setActive(id, isActive, actor) {
    await withTransaction(async (client) => {
      const existing = await couponRepository.findById(id, client);
      if (!existing) throw AppError.notFound('Coupon not found');
      await couponRepository.setActive(client, id, isActive);
      await auditService.record(client, {
        actor, action: isActive ? 'coupon.activated' : 'coupon.deactivated', entity: 'coupon', entityId: id,
        oldValue: { isActive: existing.is_active }, newValue: { isActive },
      });
    });
    return this.detail(id);
  },

  async uploadImage(id, file, actor) {
    if (!file?.buffer?.length) throw AppError.badRequest('Choose an image to upload');
    const detected = detectImageType(file.buffer);
    if (!detected) throw AppError.unsupportedMediaType('The file is not a valid JPEG, PNG or WebP image');
    if (detected.mime !== file.mimetype) throw AppError.unsupportedMediaType('The file contents do not match its declared type');

    const storage = getStorage();
    const storageKey = `offers/${id}/${randomUUID()}.${detected.ext}`;
    await storage.put(storageKey, file.buffer);

    let previousKey = null;
    try {
      await withTransaction(async (client) => {
        const existing = await couponRepository.lockById(id, client);
        if (!existing) throw AppError.notFound('Coupon not found');
        previousKey = existing.image_storage_key;
        await couponRepository.update(client, id, { image_storage_key: storageKey });
        await auditService.record(client, {
          actor,
          action: previousKey ? 'coupon.image_replaced' : 'coupon.image_uploaded',
          entity: 'coupon',
          entityId: id,
          newValue: { storageKey },
        });
      });
    } catch (error) {
      await storage.remove(storageKey).catch((cleanupError) => log.error('orphan cleanup failed', { storageKey, message: cleanupError.message }));
      throw error;
    }

    if (previousKey) {
      await storage.remove(previousKey).catch((error) => log.error('could not remove replaced offer image', { storageKey: previousKey, message: error.message }));
    }
    return this.detail(id);
  },

  /** A coupon that has never been used can be deleted outright; one that has must be deactivated instead. */
  async remove(id, actor) {
    let imageStorageKey = null;
    await withTransaction(async (client) => {
      const existing = await couponRepository.findById(id, client);
      if (!existing) throw AppError.notFound('Coupon not found');
      if (existing.used_count > 0) {
        throw AppError.conflict('This coupon has already been used and cannot be deleted. Deactivate it instead.');
      }
      imageStorageKey = existing.image_storage_key;
      await couponRepository.remove(client, id);
      await auditService.record(client, { actor, action: 'coupon.deleted', entity: 'coupon', entityId: id, oldValue: { code: existing.code } });
    });
    if (imageStorageKey) {
      await getStorage().remove(imageStorageKey).catch((error) => log.error('could not remove deleted offer image', { storageKey: imageStorageKey, message: error.message }));
    }
  },

  // ---- customer-facing discovery -----------------------------------------------------------------------

  /**
   * Public, unauthenticated: every coupon that is active, in its valid date range and not globally
   * exhausted. Deliberately does NOT attempt booking-specific eligibility (min amount, nights, hotel,
   * destination, per-customer limits) -- those need a real stay to evaluate and belong to
   * `applicableForHold` below. Sorted percentage offers first (generally the more attractive framing),
   * then by discount size -- a simple, deterministic ordering with no misleading cross-type comparison.
   */
  async listPublic() {
    const rows = await couponRepository.listActive();
    const { hotelsByCoupon, citiesByCoupon } = await couponRepository.restrictionsFor(rows.map((r) => r.id));
    return rows
      .map((row) => toPublicCoupon(row, hotelsByCoupon.get(row.id) ?? [], citiesByCoupon.get(row.id) ?? []))
      .sort((a, b) => (a.discountType === b.discountType ? b.discountValue - a.discountValue : a.discountType === 'PERCENT' ? -1 : 1));
  },

  /**
   * Owner-scoped discovery for a specific hold: every active coupon that would actually be accepted right
   * now, reusing the exact same `resolveEligibility` the real apply endpoint uses -- no second validation
   * implementation. This is read-only and reserves nothing, so it is a courtesy preview, not a guarantee:
   * the real POST .../coupon call re-validates and reserves atomically, and can still reject a coupon
   * shown here if its last slot was taken in the meantime.
   */
  async applicableForHold(userId, holdId) {
    const hold = await bookingRepository.findHold(holdId);
    if (!hold || hold.user_id !== userId) throw AppError.notFound('Hold not found');

    const candidates = await couponRepository.listActive();
    const preCouponTotal = Number(hold.subtotal_minor) - Number(hold.discount_minor) + Number(hold.taxes_minor) + Number(hold.fees_minor);

    const applicable = [];
    for (const coupon of candidates) {
      if (coupon.id === hold.coupon_id) continue; // already applied -- not "available to apply"
      const errors = await resolveEligibility(pool, coupon, hold, userId, { preCouponTotal });
      if (errors.length === 0) {
        applicable.push({
          code: coupon.code,
          title: toPublicCoupon(coupon).title,
          description: coupon.description,
          discountMinor: discountFor(coupon, preCouponTotal),
        });
      }
    }
    return applicable.sort((a, b) => b.discountMinor - a.discountMinor);
  },

  // ---- customer-facing: applying a coupon to a live hold -----------------------------------------------

  /** Validates and reserves a usage slot in one atomic step, then updates the hold's price. */
  async applyToHold(userId, holdId, rawCode) {
    await withTransaction(async (client) => {
      const hold = await requireOwnedHold(client, userId, holdId);
      if (!isHoldLive(hold)) throw AppError.conflict('Your room hold has expired. Please search again.', { code: 'HOLD_EXPIRED' });
      if (hold.booking_id) throw AppError.conflict('A coupon can only be applied before payment starts.');
      if (hold.coupon_id) throw AppError.conflict('A coupon is already applied. Remove it before applying another.');

      const code = normalizeCode(rawCode);
      const coupon = await couponRepository.lockByCode(code, client);
      if (!coupon) throw AppError.notFound('This coupon code does not exist.');

      const preCouponTotal = Number(hold.total_minor);
      const errors = await resolveEligibility(client, coupon, hold, userId, { preCouponTotal });
      if (errors.length > 0) throw AppError.unprocessable(errors[0], errors.map((message) => ({ field: 'code', message })));

      const discountMinor = discountFor(coupon, preCouponTotal);
      const newTotal = preCouponTotal - discountMinor;

      await bookingRepository.applyCouponToHold(client, hold.id, { couponId: coupon.id, couponCode: coupon.code, couponDiscount: discountMinor, total: newTotal });
      await couponRepository.insertPendingUsage(client, { couponId: coupon.id, holdId: hold.id, userId, discountMinor });
      await couponRepository.incrementUsedCount(client, coupon.id);
      await auditService.record(client, {
        actor: { id: userId }, action: 'booking_hold.coupon_applied', entity: 'booking_hold', entityId: hold.id,
        newValue: { couponCode: coupon.code, discountMinor },
      });
    });
  },

  async removeFromHold(userId, holdId) {
    await withTransaction(async (client) => {
      const hold = await requireOwnedHold(client, userId, holdId);
      if (hold.booking_id) throw AppError.conflict('A coupon can only be removed before payment starts.');
      if (!hold.coupon_id) return;

      await couponRepository.releaseUsageForHold(client, hold.id);
      const restoredTotal = Number(hold.total_minor) + Number(hold.coupon_discount_minor);
      await bookingRepository.applyCouponToHold(client, hold.id, { couponId: null, couponCode: null, couponDiscount: 0, total: restoredTotal });
      await auditService.record(client, {
        actor: { id: userId }, action: 'booking_hold.coupon_removed', entity: 'booking_hold', entityId: hold.id,
        oldValue: { couponCode: hold.coupon_code },
      });
    });
  },

  /**
   * Called by hold.service.js's requote() after a fresh quote is computed. If no coupon is applied, this
   * is a no-op. If one is applied, re-validates it against the new pre-coupon total (nights/hotel/dates
   * never change on a requote, only price can) and either recomputes the discount or drops the coupon if
   * it is no longer eligible (e.g. the new total fell under the minimum amount).
   */
  async reapplyOnRequote(client, hold, newPreCouponTotal) {
    if (!hold.coupon_id) return { couponDiscountMinor: 0, couponCode: null, total: newPreCouponTotal };

    const coupon = await couponRepository.lockById(hold.coupon_id, client);
    const errors = coupon
      ? await resolveEligibility(client, coupon, hold, hold.user_id, { preCouponTotal: newPreCouponTotal })
      : ['This coupon is no longer available.'];
    if (errors.length > 0) {
      await couponRepository.releaseUsageForHold(client, hold.id);
      await bookingRepository.applyCouponToHold(client, hold.id, { couponId: null, couponCode: null, couponDiscount: 0, total: newPreCouponTotal });
      await auditService.record(client, {
        actor: { id: hold.user_id }, action: 'booking_hold.coupon_removed', entity: 'booking_hold', entityId: hold.id,
        oldValue: { couponCode: hold.coupon_code }, newValue: { reason: 'no_longer_eligible_after_reprice' },
      });
      return { couponDiscountMinor: 0, couponCode: null, total: newPreCouponTotal, removed: true };
    }

    const discountMinor = discountFor(coupon, newPreCouponTotal);
    await couponRepository.updatePendingUsageAmount(client, hold.id, discountMinor);
    const total = newPreCouponTotal - discountMinor;
    await bookingRepository.applyCouponToHold(client, hold.id, { couponId: coupon.id, couponCode: coupon.code, couponDiscount: discountMinor, total });
    return { couponDiscountMinor: discountMinor, couponCode: coupon.code, total };
  },

  /** Releases a hold's reserved usage slot. Called wherever a hold ends without becoming a paid booking. */
  async releaseUsageForHold(client, holdId) {
    await couponRepository.releaseUsageForHold(client, holdId);
  },

  /** Finalizes a hold's usage once its booking is actually confirmed (payment settled). */
  async confirmUsageForHold(client, holdId, bookingId) {
    await couponRepository.confirmUsageForHold(client, holdId, bookingId);
  },
};
