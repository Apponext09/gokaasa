import { pool } from './pool.js';
import { seedAmenities } from '../../seeds/001_amenities.js';
import { seedAdminUser } from '../../seeds/002_admin_user.js';
import { seedNaviMumbaiHotels } from '../../seeds/003_navi_mumbai_hotels.js';

/** Idempotent seed runner. Safe to run on every deploy. */
async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const amenities = await seedAmenities(client);
    const admin = await seedAdminUser(client);
    await client.query('COMMIT');
    console.log(`[seed] amenities upserted: ${amenities}`);
    console.log(`[seed] admin: ${admin}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  // Runs after the admin-user transaction commits: it needs to look up that admin (via the plain pool,
  // a separate connection) and each hotel/room/rate/inventory call manages its own transaction, the same
  // way the admin API itself does.
  const hotels = await seedNaviMumbaiHotels();
  console.log(Array.isArray(hotels) ? hotels.map((line) => `[seed] ${line}`).join('\n') : `[seed] hotels: ${hotels}`);
  await pool.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
