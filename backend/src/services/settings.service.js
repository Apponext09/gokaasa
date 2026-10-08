import { withTransaction } from '../db/pool.js';
import { settingsRepository } from '../repositories/settings.repository.js';
import { auditService } from './audit.service.js';
import { config } from '../config/index.js';

/** The only keys a PATCH may change. Everything else in config/index.js stays untouched and unexposed. */
const EDITABLE_KEYS = ['company_name', 'support_phone', 'support_email'];

export const settingsService = {
  /** ADMIN and HOTEL_MANAGER can both read this; only ADMIN can write (enforced at the route). */
  async get() {
    const stored = await settingsRepository.getAll();
    return {
      platform: {
        companyName: stored.company_name?.value ?? 'Gokaasa',
        supportPhone: stored.support_phone?.value ?? '',
        supportEmail: stored.support_email?.value ?? '',
      },
      booking: {
        holdDurationMinutes: config.booking.holdDurationMinutes,
        businessTimezone: config.booking.businessTimezone,
      },
      notifications: {
        emailConfigured: Boolean(config.mail.host),
      },
      security: {
        passwordResetTtlMinutes: config.auth.passwordResetTtlMinutes,
      },
    };
  },

  /** ADMIN only, enforced by the route. Silently ignores any key outside the editable whitelist. */
  async update(body, actor) {
    const entries = Object.fromEntries(
      Object.entries({ company_name: body.companyName, support_phone: body.supportPhone, support_email: body.supportEmail })
        .filter(([key, value]) => EDITABLE_KEYS.includes(key) && value !== undefined),
    );
    if (Object.keys(entries).length === 0) return this.get();

    await withTransaction(async (client) => {
      await settingsRepository.setMany(client, entries, actor.id);
      await auditService.record(client, { actor, action: 'settings.updated', entity: 'platform_settings', entityId: 'platform', newValue: entries });
    });
    return this.get();
  },
};
