import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';
import { config } from '../../src/config/index.js';

/**
 * PHASE 10A PART 29 -- MANDATORY PRODUCTION SAFETY TEST.
 *
 * `config.features.allowIllustrativeHotelImages` is read once at process start, so a single test
 * process cannot exercise both the flag-on and flag-off behaviour. This file must be run as its own
 * process with the flag explicitly forced off:
 *
 *   ALLOW_ILLUSTRATIVE_HOTEL_IMAGES=false node --env-file-if-exists=.env --test --test-concurrency=1 tests/integration/illustrativeImageProductionSafety.test.js
 *
 * (Windows PowerShell: $env:ALLOW_ILLUSTRATIVE_HOTEL_IMAGES='false'; node ... ; Remove-Item Env:\ALLOW_ILLUSTRATIVE_HOTEL_IMAGES)
 *
 * When run as part of the plain `npm test` glob (which inherits backend/.env's pilot-mode
 * ALLOW_ILLUSTRATIVE_HOTEL_IMAGES=true for this dev environment), every test below is SKIPPED rather
 * than failed, so it never corrupts the main regression count -- it only ever asserts something real
 * when actually invoked with the flag off.
 */
const flagIsOff = config.features.allowIllustrativeHotelImages === false;
const skip = flagIsOff ? false : 'requires ALLOW_ILLUSTRATIVE_HOTEL_IMAGES=false for this process (see file header)';

const MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'gokaasa-prod-safety-'));
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

before(async () => {
  if (skip) return;
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'prodsafety.admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
  adminToken = (await request(app).post('/api/auth/login').send({ email: 'prodsafety.admin@example.com', password: PASSWORD })).body.accessToken;
  server = await startFixtureServer();
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  await new Promise((resolve) => server.close(resolve));
  await closeTestDatabase();
  rmSync(MEDIA_DIR, { recursive: true, force: true });
});

describe('production safety: illustrative images must never satisfy the publish gate when the pilot flag is off', { skip }, () => {
  it('a hotel with only an ILLUSTRATIVE image keeps "At least one image" as a publish blocker', async () => {
    assert.equal(config.features.allowIllustrativeHotelImages, false);

    const created = await request(app).post('/api/admin/hotels').set(bearer(adminToken)).send({ name: 'Prod Safety Hotel', city: 'Navi Mumbai', countryCode: 'IN' });
    const id = created.body.hotel.id;
    await request(app).patch(`/api/admin/hotels/${id}`).set(bearer(adminToken)).send({
      description: 'Production safety check.', starRating: 3, addressLine: '1 Safety Road', latitude: 19.07, longitude: 73.0,
    });
    await request(app).put(`/api/admin/hotels/${id}/amenities`).set(bearer(adminToken)).send({ codes: ['WIFI'] });

    const image = await request(app).post(`/api/admin/hotels/${id}/images/from-url`).set(bearer(adminToken)).send({
      sourceUrl: `${baseUrl}/photo.png`, sourceProvider: 'unsplash', imageType: 'ILLUSTRATIVE',
    });
    assert.equal(image.status, 201);
    assert.equal(image.body.image.imageType, 'ILLUSTRATIVE');
    await request(app).post(`/api/admin/hotels/${id}/images/${image.body.image.id}/cover`).set(bearer(adminToken));

    const detail = await request(app).get(`/api/admin/hotels/${id}`).set(bearer(adminToken));
    assert.ok(
      detail.body.hotel.publishBlockers.includes('At least one image'),
      `expected "At least one image" to remain a blocker with the flag off, got: ${JSON.stringify(detail.body.hotel.publishBlockers)}`,
    );
  });

  it('PUBLISH is rejected end-to-end for an illustrative-only hotel when the flag is off', async () => {
    const created = await request(app).post('/api/admin/hotels').set(bearer(adminToken)).send({ name: 'Prod Safety Hotel 2', city: 'Navi Mumbai', countryCode: 'IN' });
    const id = created.body.hotel.id;
    await request(app).patch(`/api/admin/hotels/${id}`).set(bearer(adminToken)).send({
      description: 'Production safety check.', starRating: 3, addressLine: '2 Safety Road', latitude: 19.07, longitude: 73.0,
    });
    await request(app).put(`/api/admin/hotels/${id}/amenities`).set(bearer(adminToken)).send({ codes: ['WIFI'] });
    const image = await request(app).post(`/api/admin/hotels/${id}/images/from-url`).set(bearer(adminToken)).send({
      sourceUrl: `${baseUrl}/photo.png`, sourceProvider: 'unsplash', imageType: 'ILLUSTRATIVE',
    });
    await request(app).post(`/api/admin/hotels/${id}/images/${image.body.image.id}/cover`).set(bearer(adminToken));

    await request(app).post(`/api/admin/hotels/${id}/status`).set(bearer(adminToken)).send({ action: 'SUBMIT_FOR_REVIEW' });

    // The publish blockers are enforced on the transition INTO READY_TO_PUBLISH too, so this is already
    // expected to fail here -- an illustrative-only hotel never even reaches READY_TO_PUBLISH with the
    // flag off, let alone PUBLISHED.
    const markReady = await request(app).post(`/api/admin/hotels/${id}/status`).set(bearer(adminToken)).send({ action: 'MARK_READY' });
    assert.equal(markReady.status, 422, JSON.stringify(markReady.body));

    const publish = await request(app).post(`/api/admin/hotels/${id}/status`).set(bearer(adminToken)).send({ action: 'PUBLISH' });
    assert.notEqual(publish.status, 200, JSON.stringify(publish.body));

    const finalState = await request(app).get(`/api/admin/hotels/${id}`).set(bearer(adminToken));
    assert.notEqual(finalState.body.hotel.status, 'PUBLISHED');
  });
});
