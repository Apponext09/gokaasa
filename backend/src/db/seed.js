import { pool } from './pool.js';
import { seedAmenities } from '../../seeds/001_amenities.js';
import { seedAdminUser } from '../../seeds/002_admin_user.js';

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
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
