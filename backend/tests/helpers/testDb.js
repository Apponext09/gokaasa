process.env.NODE_ENV = 'test';

import { pool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { seedAmenities } from '../../seeds/001_amenities.js';
import { ImportQueue } from '../../src/jobs/importQueue.js';
import { hotelImportService, setImportQueue } from '../../src/services/hotelImport.service.js';
import { createApp } from '../../src/app.js';

const TABLES_TO_CLEAR = [
  'platform_settings',
  'notifications',
  'newsletter_subscribers',
  'audit_logs',
  'payment_webhook_events',
  'booking_holds',
  'hotel_import_logs',
  'hotel_import_jobs',
  'external_hotel_sources',
  'reviews',
  'wishlists',
  'coupon_usages',
  'refunds',
  'payments',
  'booking_guests',
  'booking_rooms',
  'bookings',
  'coupons',
  'inventory_reservations',
  'availability_blocks',
  'room_inventory',
  'rate_prices',
  'rate_plans',
  'room_amenities',
  'room_images',
  'rooms',
  'room_types',
  'cancellation_policies',
  'hotel_policies',
  'hotel_field_states',
  'hotel_images',
  'hotel_amenities',
  'hotel_locations',
  'hotels',
  'user_sessions',
  'refresh_tokens',
  'password_reset_tokens',
  'user_roles',
  'users',
];

/**
 * Prepares a clean database for integration tests. It refuses to run unless the database name
 * contains "test", so it can never truncate a real environment by accident.
 */
export async function prepareTestDatabase() {
  const dbName = process.env.DB_NAME ?? '';
  if (!/test/i.test(dbName)) {
    throw new Error(`Refusing to run integration tests against database "${dbName}". Use a database whose name contains "test".`);
  }

  await runMigrations({ log: () => {} });
  await pool.query(`TRUNCATE ${TABLES_TO_CLEAR.join(', ')} RESTART IDENTITY CASCADE`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await seedAmenities(client);
    await client.query('COMMIT');
  } finally {
    client.release();
  }

  const queue = new ImportQueue({ concurrency: 1, handler: (id) => hotelImportService.processJob(id) });
  setImportQueue(queue);
  return createApp();
}

/** Polls an import job until it leaves PENDING/PROCESSING. */
export async function waitForJob(request, token, jobId, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request.get(`/api/admin/hotel-import/jobs/${jobId}`).set('Authorization', `Bearer ${token}`);
    if (!['PENDING', 'PROCESSING'].includes(res.body.job.status)) return res.body.job;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Import job ${jobId} did not finish within ${timeoutMs}ms`);
}

export async function closeTestDatabase() {
  await pool.end();
}

/** Creates an active user with one role, bypassing the public registration route (which only grants CUSTOMER). */
export async function createUserWithRole({ email, password, roleCode }) {
  const bcrypt = (await import('bcryptjs')).default;
  const { userRepository } = await import('../../src/repositories/user.repository.js');
  const passwordHash = await bcrypt.hash(password, 4);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = await userRepository.create(client, {
      email,
      passwordHash,
      firstName: 'Test',
      lastName: 'User',
      roleCode,
    });
    await client.query('COMMIT');
    return id;
  } finally {
    client.release();
  }
}
