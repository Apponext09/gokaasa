import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';
import { pool } from '../../src/db/pool.js';

const MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'gokaasa-image-import-'));
process.env.MEDIA_DIR = MEDIA_DIR;

const PASSWORD = 'Strong-pass-123';

// A real, minimal, valid 1x1 PNG -- small enough to inline, but genuinely a PNG `detectImageType` accepts.
const REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

let app;
let adminToken;
let hotelId;
let server;
let baseUrl;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

/** A tiny local HTTP fixture server, so these tests never depend on a real external image host. */
function startFixtureServer() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      if (req.url === '/real-photo.png') {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': REAL_PNG.length });
        res.end(REAL_PNG);
      } else if (req.url === '/not-an-image.html') {
        const body = '<html><body>Not an image</body></html>';
        res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Length': Buffer.byteLength(body) });
        res.end(body);
      } else if (req.url === '/too-big.png') {
        const big = Buffer.alloc(6 * 1024 * 1024, 1); // 6MB, over the 5MB limit
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': big.length });
        res.end(big);
      } else if (req.url === '/missing.png') {
        res.writeHead(404);
        res.end();
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}

before(async () => {
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'image.admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
  adminToken = (await request(app).post('/api/auth/login').send({ email: 'image.admin@example.com', password: PASSWORD })).body.accessToken;

  const created = await request(app).post('/api/admin/hotels').set(bearer(adminToken)).send({ name: 'Image Import Test Hotel', city: 'Navi Mumbai', countryCode: 'IN' });
  hotelId = created.body.hotel.id;

  server = await startFixtureServer();
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closeTestDatabase();
  rmSync(MEDIA_DIR, { recursive: true, force: true });
});

describe('importing a real image from a free/public URL', () => {
  it('rejects a URL that returns HTML, not an image', async () => {
    const res = await request(app).post(`/api/admin/hotels/${hotelId}/images/from-url`).set(bearer(adminToken)).send({
      sourceUrl: `${baseUrl}/not-an-image.html`, sourceProvider: 'wikimedia_commons',
    });
    assert.equal(res.status, 415, JSON.stringify(res.body));
  });

  it('rejects an image larger than the upload size limit', async () => {
    const res = await request(app).post(`/api/admin/hotels/${hotelId}/images/from-url`).set(bearer(adminToken)).send({
      sourceUrl: `${baseUrl}/too-big.png`, sourceProvider: 'wikimedia_commons',
    });
    assert.equal(res.status, 415, JSON.stringify(res.body));
  });

  it('rejects a URL that does not resolve', async () => {
    const res = await request(app).post(`/api/admin/hotels/${hotelId}/images/from-url`).set(bearer(adminToken)).send({
      sourceUrl: `${baseUrl}/missing.png`, sourceProvider: 'wikimedia_commons',
    });
    assert.equal(res.status, 400);
  });

  it('downloads, validates and stores a real image, clearing the "at least one image" publish blocker', async () => {
    const before = await request(app).get(`/api/admin/hotels/${hotelId}`).set(bearer(adminToken));
    assert.ok(before.body.hotel.publishBlockers.includes('At least one image'));

    const res = await request(app).post(`/api/admin/hotels/${hotelId}/images/from-url`).set(bearer(adminToken)).send({
      sourceUrl: `${baseUrl}/real-photo.png`, category: 'EXTERIOR', sourceProvider: 'wikimedia_commons', altText: 'Test fixture, not a real hotel photo',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.image.category, 'EXTERIOR');

    const row = await pool.query(`SELECT source_url, source_provider, origin, mime_type, content_hash, byte_size FROM hotel_images WHERE id = $1`, [res.body.image.id]);
    assert.equal(row.rows[0].source_provider, 'wikimedia_commons');
    assert.equal(row.rows[0].origin, 'IMPORTED');
    assert.equal(row.rows[0].mime_type, 'image/png');
    assert.equal(Number(row.rows[0].byte_size), REAL_PNG.length);
    assert.ok(row.rows[0].content_hash);

    const after = await request(app).get(`/api/admin/hotels/${hotelId}`).set(bearer(adminToken));
    assert.equal(after.body.hotel.publishBlockers.includes('At least one image'), false);
  });

  it('is idempotent: importing the exact same image content twice is rejected as a duplicate, not stored again', async () => {
    const countBefore = (await pool.query(`SELECT COUNT(*)::int AS c FROM hotel_images WHERE hotel_id = $1 AND deleted_at IS NULL`, [hotelId])).rows[0].c;
    const res = await request(app).post(`/api/admin/hotels/${hotelId}/images/from-url`).set(bearer(adminToken)).send({
      sourceUrl: `${baseUrl}/real-photo.png`, sourceProvider: 'wikimedia_commons',
    });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    const countAfter = (await pool.query(`SELECT COUNT(*)::int AS c FROM hotel_images WHERE hotel_id = $1 AND deleted_at IS NULL`, [hotelId])).rows[0].c;
    assert.equal(countAfter, countBefore, 'no second row was inserted for the same image content');
  });

  it('a HOTEL_OWNER cannot import an image onto a hotel they do not own (IDOR)', async () => {
    await createUserWithRole({ email: 'image.manager@example.com', password: PASSWORD, roleCode: 'HOTEL_OWNER' });
    const managerToken = (await request(app).post('/api/auth/login').send({ email: 'image.manager@example.com', password: PASSWORD })).body.accessToken;
    const res = await request(app).post(`/api/admin/hotels/${hotelId}/images/from-url`).set(bearer(managerToken)).send({
      sourceUrl: `${baseUrl}/real-photo.png`, sourceProvider: 'wikimedia_commons',
    });
    assert.equal(res.status, 404);
  });
});
