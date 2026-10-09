import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { closeTestDatabase, prepareTestDatabase } from '../helpers/testDb.js';
import { pool } from '../../src/db/pool.js';
import { config } from '../../src/config/index.js';
import { seedNaviMumbaiHotels } from '../../seeds/003_navi_mumbai_hotels.js';

/**
 * Covers the real-hotel-catalog seed itself (idempotency, required fields, bookability) -- NOT hotel
 * search or booking in general, which are already covered everywhere else and are unaffected by this
 * work (confirmed by the full suite staying green).
 */

let app;

before(async () => {
  app = await prepareTestDatabase(); // wipes hotels/users; this seed needs its own fresh ADMIN first
  const { createUserWithRole } = await import('../helpers/testDb.js');
  await createUserWithRole({ email: 'catalog.admin@example.com', password: 'Strong-pass-123', roleCode: 'ADMIN' });
});

after(async () => {
  await closeTestDatabase();
});

describe('real hotel catalog seed', () => {
  it('creates every hotel on the first run', async () => {
    const results = await seedNaviMumbaiHotels();
    assert.equal(results.length, 10);
    assert.ok(results.every((line) => line.includes('created')));
  });

  it('is idempotent: running it again creates nothing new', async () => {
    const before = (await pool.query(`SELECT COUNT(*)::int AS c FROM hotels`)).rows[0].c;
    const results = await seedNaviMumbaiHotels();
    assert.ok(results.every((line) => line.includes('already existed')));
    assert.ok(results.every((line) => line.includes('already has 1 image(s)')));
    const after = (await pool.query(`SELECT COUNT(*)::int AS c FROM hotels`)).rows[0].c;
    assert.equal(after, before, 'the hotel count did not change on a second run');
    const imageCounts = await pool.query(
      `SELECT hotel_id, COUNT(*)::int AS c FROM hotel_images WHERE deleted_at IS NULL GROUP BY hotel_id`,
    );
    assert.ok(imageCounts.rows.every((row) => row.c === 1), 'no hotel should have gained a duplicate illustrative image on re-run');
  });

  it('every seeded hotel has the required fields for publishing, except an image', async () => {
    const { rows } = await pool.query(
      `SELECT id, name, description, star_rating, address_line, city, country_code, latitude, longitude
         FROM hotels WHERE external_provider = 'openstreetmap'`,
    );
    assert.equal(rows.length, 10);
    for (const h of rows) {
      assert.ok(h.name);
      assert.ok(h.description);
      assert.ok(h.star_rating >= 1 && h.star_rating <= 5);
      assert.ok(h.address_line);
      assert.equal(h.city, 'Navi Mumbai');
      assert.equal(h.country_code, 'IN');
      assert.ok(h.latitude && h.longitude);
    }
  });

  it('every seeded hotel has at least one room type, a rate plan, and priced inventory for a real future date', async () => {
    const { rows: hotels } = await pool.query(`SELECT id FROM hotels WHERE external_provider = 'openstreetmap'`);
    assert.equal(hotels.length, 10);
    for (const { id: hotelId } of hotels) {
      const rooms = await pool.query(`SELECT id FROM room_types WHERE hotel_id = $1`, [hotelId]);
      assert.equal(rooms.rowCount, 1, `hotel ${hotelId} should have exactly one seeded room type`);
      const plans = await pool.query(`SELECT id FROM rate_plans WHERE room_type_id = $1`, [rooms.rows[0].id]);
      assert.equal(plans.rowCount, 1);
      const futureDate = new Date();
      futureDate.setUTCDate(futureDate.getUTCDate() + 30);
      const price = await pool.query(
        `SELECT final_price_minor FROM rate_prices WHERE rate_plan_id = $1 AND stay_date = $2::date`,
        [plans.rows[0].id, futureDate.toISOString().slice(0, 10)],
      );
      assert.equal(price.rowCount, 1, `hotel ${hotelId} should have a real price 30 days out`);
      assert.ok(Number(price.rows[0].final_price_minor) > 0);
    }
  });

  it('every seeded hotel is fully publishable once its illustrative cover is attached (Phase 10A pilot)', async () => {
    // The seed itself attaches one clearly-labelled ILLUSTRATIVE cover and, only while
    // ALLOW_ILLUSTRATIVE_HOTEL_IMAGES is on (this dev/test environment's pilot mode), walks every hotel
    // through to PUBLISHED. With the flag off, the same catalogue would stay blocked on a real image --
    // see illustrativeImageProductionSafety.test.js for that behaviour, verified under its own process.
    const { rows: hotels } = await pool.query(`SELECT id FROM hotels WHERE external_provider = 'openstreetmap'`);
    const admin = await request(app).post('/api/auth/login').send({ email: 'catalog.admin@example.com', password: 'Strong-pass-123' });
    const token = admin.body.accessToken;
    for (const { id } of hotels) {
      const res = await request(app).get(`/api/admin/hotels/${id}`).set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.hotel.images.length, 1);
      assert.equal(res.body.hotel.images[0].imageType, 'ILLUSTRATIVE');
      if (config.features.allowIllustrativeHotelImages) {
        assert.deepEqual(res.body.hotel.publishBlockers, []);
        assert.equal(res.body.hotel.status, 'PUBLISHED');
      } else {
        assert.deepEqual(res.body.hotel.publishBlockers, ['At least one image']);
        assert.notEqual(res.body.hotel.status, 'PUBLISHED');
      }
    }
  });

  it('maps consistently to the Navi Mumbai destination used by search/discovery', async () => {
    const { rows } = await pool.query(`SELECT DISTINCT city FROM hotels WHERE external_provider = 'openstreetmap'`);
    assert.deepEqual(rows.map((r) => r.city), ['Navi Mumbai']);
  });
});
