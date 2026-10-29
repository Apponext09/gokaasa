process.env.NODE_ENV = 'test';

import { pool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { seedAmenities } from '../../seeds/001_amenities.js';
import { ImportQueue } from '../../src/jobs/importQueue.js';
import { getImportQueue, hotelImportService, setImportQueue } from '../../src/services/hotelImport.service.js';
import { createApp } from '../../src/app.js';

const TABLES_TO_CLEAR = [
  'email_deliveries',
  'email_change_requests',
  'platform_settings',
  'notifications',
  'newsletter_subscribers',
  'audit_logs',
  'payment_webhook_events',
  'booking_holds',
  'hotel_import_logs',
  'hotel_import_jobs',
  'external_hotel_sources',
  'hotel_review_events',
  'hotel_review_issues',
  'hotel_reviews',
  'reviews',
  'wishlists',
  'coupon_usages',
  // Phase 2 ledger tables -- TRUNCATE ... CASCADE below would reach these transitively anyway (they FK
  // into bookings/hotels/refunds/payments, all listed), but listed explicitly for clarity.
  'settlement_line_items',
  'partner_ledger_entries',
  'settlements',
  'booking_commissions',
  'commission_configs',
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
  'hotel_onboarding_assignments',
  'hotels',
  'user_sessions',
  'refresh_tokens',
  'password_reset_tokens',
  'user_roles',
  'users',
];

async function seedCatalogMasters(client) {
  await client.query(`
    INSERT INTO property_types (code, name, sort_order) VALUES
      ('HOTEL', 'Hotel', 10), ('RESORT', 'Resort', 20), ('VILLA', 'Villa', 30),
      ('APARTMENT', 'Apartment', 40), ('HOSTEL', 'Hostel', 50), ('GUEST_HOUSE', 'Guest house', 60)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, is_active = TRUE
  `);
  await client.query(`
    INSERT INTO room_categories (code, name, sort_order) VALUES
      ('STANDARD', 'Standard', 10), ('DELUXE', 'Deluxe', 20), ('SUITE', 'Suite', 30),
      ('FAMILY', 'Family', 40), ('VILLA', 'Villa', 50), ('DORM', 'Dormitory', 60), ('OTHER', 'Other', 70)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, is_active = TRUE
  `);
  await client.query(`
    INSERT INTO bed_types (code, name, sort_order) VALUES
      ('KING', 'King', 10), ('QUEEN', 'Queen', 20), ('DOUBLE', 'Double', 30),
      ('TWIN', 'Twin', 40), ('SINGLE', 'Single', 50), ('SOFA_BED', 'Sofa bed', 60), ('BUNK', 'Bunk', 70)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, is_active = TRUE
  `);
  await client.query(`
    INSERT INTO image_categories (code, name, sort_order) VALUES
      ('EXTERIOR', 'Exterior', 10), ('LOBBY', 'Lobby', 20), ('ROOM', 'Room', 30),
      ('BATHROOM', 'Bathroom', 40), ('RESTAURANT', 'Restaurant', 50), ('POOL', 'Pool', 60),
      ('GYM', 'Gym', 70), ('SPA', 'Spa', 80), ('OTHER', 'Other', 90)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, is_active = TRUE
  `);
  await client.query(`
    INSERT INTO meal_plans (code, name, includes_breakfast, includes_lunch, includes_dinner, sort_order) VALUES
      ('ROOM_ONLY', 'Room only', FALSE, FALSE, FALSE, 10),
      ('BREAKFAST', 'Breakfast included', TRUE, FALSE, FALSE, 20),
      ('HALF_BOARD', 'Half board', TRUE, FALSE, TRUE, 30),
      ('FULL_BOARD', 'Full board', TRUE, TRUE, TRUE, 40)
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      includes_breakfast = EXCLUDED.includes_breakfast,
      includes_lunch = EXCLUDED.includes_lunch,
      includes_dinner = EXCLUDED.includes_dinner,
      sort_order = EXCLUDED.sort_order,
      is_active = TRUE
  `);
}

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
    // TRUNCATE users ... CASCADE also clears every master table with a created_by FK. Restore the
    // baseline catalog before tests create hotels, rooms, images, or rate plans.
    await seedCatalogMasters(client);
    await seedAmenities(client);
    // commission_configs is truncated above like any other table, but the platform MUST always have a
    // global default rate (commission.service.js relies on one always existing) -- migration 022 seeds
    // this once at migrate time, but the truncate above wipes it on every test run, so it's reseeded here
    // the same way seedAmenities() re-seeds amenities.
    await client.query(`INSERT INTO commission_configs (hotel_id, rate_percent, reason) VALUES (NULL, 15.00, 'Initial platform default')`);
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

/**
 * Stops accepting new import work and waits for whatever is already running to finish BEFORE ending
 * the shared pool. Without this, a job enqueued by a test (import jobs run detached, fire-and-forget,
 * via ImportQueue.pump()) can still be mid-handler -- including trailing work after its DB status is
 * already terminal -- when this same file's own teardown ends the pool, producing "Cannot use a pool
 * after calling end on the pool" in whatever query the job happens to be running at that moment.
 */
export async function closeTestDatabase() {
  const queue = getImportQueue();
  if (queue) await queue.stop();
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
