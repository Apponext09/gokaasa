import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';
import { pool } from '../../src/db/pool.js';
import { config } from '../../src/config/index.js';

/**
 * Covers Phase 10A's pilot-mode behaviour: this file must run with the pilot flag ON (the committed
 * backend/.env already sets ALLOW_ILLUSTRATIVE_HOTEL_IMAGES=true, which is what this dev/test process
 * inherits). The flag-OFF / production-safety side is a *separate* file
 * (illustrativeImageProductionSafety.test.js) that must be run with the flag explicitly overridden to
 * false at the shell -- config is parsed once at process start, so a single process cannot exercise both.
 */

const MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'gokaasa-illustrative-'));
process.env.MEDIA_DIR = MEDIA_DIR;

const PASSWORD = 'Strong-pass-123';
const REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

let app;
let adminToken;
let server;
let baseUrl;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

function startFixtureServer() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': REAL_PNG.length });
      res.end(REAL_PNG);
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}

async function newDraftHotel(name) {
  const created = await request(app).post('/api/admin/hotels').set(bearer(adminToken)).send({ name, city: 'Navi Mumbai', countryCode: 'IN' });
  const id = created.body.hotel.id;
  await request(app).patch(`/api/admin/hotels/${id}`).set(bearer(adminToken)).send({
    description: 'A test hotel for Phase 10A.', starRating: 3, addressLine: '1 Test Road', latitude: 19.07, longitude: 73.0,
  });
  await request(app).put(`/api/admin/hotels/${id}/amenities`).set(bearer(adminToken)).send({ codes: ['WIFI'] });
  return id;
}

async function publishPath(id) {
  for (const action of ['SUBMIT_FOR_REVIEW', 'MARK_READY', 'PUBLISH']) {
    const res = await request(app).post(`/api/admin/hotels/${id}/status`).set(bearer(adminToken)).send({ action });
    if (res.status !== 200) return res;
  }
  return { status: 200 };
}

before(async () => {
  assert.equal(config.features.allowIllustrativeHotelImages, true, 'this test file requires the pilot flag ON (check backend/.env)');
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'illustrative.admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
  adminToken = (await request(app).post('/api/auth/login').send({ email: 'illustrative.admin@example.com', password: PASSWORD })).body.accessToken;
  server = await startFixtureServer();
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closeTestDatabase();
  rmSync(MEDIA_DIR, { recursive: true, force: true });
});

describe('illustrative images in pilot mode', () => {
  it('an illustrative image persists image_type correctly and is never mistaken for a real one', async () => {
    const id = await newDraftHotel('Illustrative Persist Test');
    const res = await request(app).post(`/api/admin/hotels/${id}/images/from-url`).set(bearer(adminToken)).send({
      sourceUrl: `${baseUrl}/photo.png`, sourceProvider: 'unsplash', imageType: 'ILLUSTRATIVE', altText: 'Illustrative business hotel',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.image.imageType, 'ILLUSTRATIVE');

    const row = await pool.query(`SELECT image_type FROM hotel_images WHERE id = $1`, [res.body.image.id]);
    assert.equal(row.rows[0].image_type, 'ILLUSTRATIVE');
  });

  it('defaults to REAL_PROPERTY when imageType is not specified, unchanged from before this phase', async () => {
    const id = await newDraftHotel('Default Image Type Test');
    const res = await request(app).post(`/api/admin/hotels/${id}/images/from-url`).set(bearer(adminToken)).send({ sourceUrl: `${baseUrl}/photo.png`, sourceProvider: 'manual' });
    assert.equal(res.status, 201);
    assert.equal(res.body.image.imageType, 'REAL_PROPERTY');
  });

  it('an illustrative-only hotel satisfies the publish gate while the pilot flag is on', async () => {
    const id = await newDraftHotel('Illustrative Publish Test');
    const before = await request(app).get(`/api/admin/hotels/${id}`).set(bearer(adminToken));
    assert.ok(before.body.hotel.publishBlockers.includes('At least one image'));

    const image = await request(app).post(`/api/admin/hotels/${id}/images/from-url`).set(bearer(adminToken)).send({
      sourceUrl: `${baseUrl}/photo.png`, sourceProvider: 'unsplash', imageType: 'ILLUSTRATIVE',
    });
    await request(app).post(`/api/admin/hotels/${id}/images/${image.body.image.id}/cover`).set(bearer(adminToken));

    const after = await request(app).get(`/api/admin/hotels/${id}`).set(bearer(adminToken));
    assert.deepEqual(after.body.hotel.publishBlockers, []);

    const published = await publishPath(id);
    assert.equal(published.status, 200, JSON.stringify(published));
    const final = await request(app).get(`/api/admin/hotels/${id}`).set(bearer(adminToken));
    assert.equal(final.body.hotel.status, 'PUBLISHED');
  });

  it('a hotel with a real property cover image publishes the same way it always did', async () => {
    const id = await newDraftHotel('Real Property Publish Test');
    const image = await request(app).post(`/api/admin/hotels/${id}/images/from-url`).set(bearer(adminToken)).send({
      sourceUrl: `${baseUrl}/photo.png`, sourceProvider: 'manual', imageType: 'REAL_PROPERTY',
    });
    await request(app).post(`/api/admin/hotels/${id}/images/${image.body.image.id}/cover`).set(bearer(adminToken));
    const published = await publishPath(id);
    assert.equal(published.status, 200, JSON.stringify(published));
  });

  it('a hotel with no image at all still cannot publish, pilot flag or not', async () => {
    const id = await newDraftHotel('No Image Test');
    const res = await request(app).get(`/api/admin/hotels/${id}`).set(bearer(adminToken));
    assert.ok(res.body.hotel.publishBlockers.includes('At least one image'));
    const published = await publishPath(id);
    assert.notEqual(published.status, 200, 'publishing must fail without any image');
  });

  it('the wishlist listing also reports isIllustrative on its cover image, not just search/curated cards', async () => {
    const id = await newDraftHotel('Wishlist Illustrative Test');
    const image = await request(app).post(`/api/admin/hotels/${id}/images/from-url`).set(bearer(adminToken)).send({
      sourceUrl: `${baseUrl}/photo.png`, sourceProvider: 'unsplash', imageType: 'ILLUSTRATIVE',
    });
    await request(app).post(`/api/admin/hotels/${id}/images/${image.body.image.id}/cover`).set(bearer(adminToken));
    await publishPath(id);

    await createUserWithRole({ email: 'illustrative.wishlist@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
    const customerToken = (await request(app).post('/api/auth/login').send({ email: 'illustrative.wishlist@example.com', password: PASSWORD })).body.accessToken;
    await request(app).post('/api/wishlist').set(bearer(customerToken)).send({ hotelId: id });
    const list = await request(app).get('/api/wishlist').set(bearer(customerToken));
    const entry = list.body.items.find((item) => item.id === id);
    assert.ok(entry, 'the hotel should appear in the wishlist listing');
    assert.equal(entry.image.isIllustrative, true);
  });

  it('a HOTEL_OWNER who does not own the hotel cannot import an illustrative image onto it', async () => {
    const id = await newDraftHotel('Ownership Test');
    await createUserWithRole({ email: 'illustrative.manager@example.com', password: PASSWORD, roleCode: 'HOTEL_OWNER' });
    const managerToken = (await request(app).post('/api/auth/login').send({ email: 'illustrative.manager@example.com', password: PASSWORD })).body.accessToken;
    const res = await request(app).post(`/api/admin/hotels/${id}/images/from-url`).set(bearer(managerToken)).send({
      sourceUrl: `${baseUrl}/photo.png`, sourceProvider: 'unsplash', imageType: 'ILLUSTRATIVE',
    });
    assert.equal(res.status, 404);
  });
});
