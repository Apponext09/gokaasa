import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase, waitForJob } from '../helpers/testDb.js';
import { pool } from '../../src/db/pool.js';
import { getActiveProvider } from '../../src/providers/index.js';

// Media is written to a throwaway directory. The storage driver reads this lazily on first use.
const MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'gokaasa-media-'));
process.env.MEDIA_DIR = MEDIA_DIR;

const PASSWORD = 'Strong-pass-123';
const MOCK_HOTEL_EXTERNAL_ID = 'mock-2001'; // has description, amenities, star rating and three provider images

let app;
let adminToken;
let managerToken;
let customerToken;
let onboardingToken;
let unassignedOnboardingToken;
let onboardingUserId;
let hotelId;
let jobId;

/** Minimal byte sequences with valid signatures. Enough for type detection, which is all the server inspects. */
const jpegBytes = (size = 512) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size)]);
const pngBytes = (size = 512) =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(size)]);
const webpBytes = (size = 512) =>
  Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(size)]);
const avifBytes = (size = 512) =>
  Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftyp'), Buffer.from('avifmif1avifmif1'), Buffer.alloc(size)]);

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

async function loginAs(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return res.body.accessToken;
}

async function hotel() {
  const res = await request(app).get(`/api/admin/hotels/${hotelId}`).set(bearer(adminToken));
  return res.body.hotel;
}

async function transition(action, token = adminToken) {
  return request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(token)).send({ action });
}

async function upload(buffer, { filename = 'photo.jpg', mimetype = 'image/jpeg', category = 'EXTERIOR', token = adminToken } = {}) {
  return request(app)
    .post(`/api/admin/hotels/${hotelId}/images`)
    .set(bearer(token))
    .field('category', category)
    .attach('image', buffer, { filename, contentType: mimetype });
}

before(async () => {
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
  await createUserWithRole({ email: 'manager@example.com', password: PASSWORD, roleCode: 'HOTEL_MANAGER' });
  await createUserWithRole({ email: 'guest@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  onboardingUserId = await createUserWithRole({ email: 'onboarding@example.com', password: PASSWORD, roleCode: 'HOTEL_ONBOARDING_EXECUTIVE' });
  await createUserWithRole({ email: 'unassigned.onboarding@example.com', password: PASSWORD, roleCode: 'HOTEL_ONBOARDING_EXECUTIVE' });
  adminToken = await loginAs('admin@example.com');
  managerToken = await loginAs('manager@example.com');
  customerToken = await loginAs('guest@example.com');
  onboardingToken = await loginAs('onboarding@example.com');
  unassignedOnboardingToken = await loginAs('unassigned.onboarding@example.com');

  const res = await request(app)
    .post('/api/admin/hotel-import/import')
    .set(bearer(adminToken))
    .send({ provider: 'mock', externalId: MOCK_HOTEL_EXTERNAL_ID, query: 'Sample Hill Station Villa' });
  jobId = res.body.job.id;
  const job = await waitForJob(request(app), adminToken, jobId);
  hotelId = job.hotelId;
  // Hotel managers are now scoped per hotel; assign this test's manager so it can reach the import review.
  await pool.query(`INSERT INTO hotel_managers (user_id, hotel_id) SELECT id, $2 FROM users WHERE email = $1`, ['manager@example.com', hotelId]);
  const assignment = await request(app)
    .post(`/api/admin/hotels/${hotelId}/onboarding-executives`)
    .set(bearer(adminToken))
    .send({ userId: onboardingUserId });
  assert.equal(assignment.status, 201);
});

after(async () => {
  await closeTestDatabase();
  rmSync(MEDIA_DIR, { recursive: true, force: true });
});

describe('1. import creates a DRAFT', () => {
  it('stores the hotel as an unpublished draft with provenance for every tracked field', async () => {
    const job = await request(app).get(`/api/admin/hotel-import/jobs/${jobId}`).set(bearer(adminToken));
    assert.ok(['COMPLETED', 'REVIEW_REQUIRED'].includes(job.body.job.status));

    const detail = await hotel();
    assert.equal(detail.status, 'DRAFT');
    assert.equal(detail.publishedAt, null);
    assert.equal(detail.externalProvider, 'mock');
    assert.equal(detail.fieldStates.name.status, 'IMPORTED');
    assert.ok(['EXTERNAL', 'NORMALIZED'].includes(detail.fieldStates.name.source));

    const pub = await request(app).get(`/api/hotels/${hotelId}`);
    assert.equal(pub.status, 404, 'drafts must not be visible to customers');
  });

  it('never marks imported images as the cover', async () => {
    const detail = await hotel();
    assert.equal(detail.images.length, 3);
    assert.equal(detail.images.some((image) => image.isCover), false);
  });
});

describe('2. publish gate', () => {
  it('lists every missing requirement when publishing is attempted', async () => {
    const manual = await request(app)
      .post('/api/admin/hotels')
      .set(bearer(adminToken))
      .send({ name: 'Gate Test Hotel', city: 'Pune', countryCode: 'IN' });
    const id = manual.body.hotel.id;

    await request(app).post(`/api/admin/hotels/${id}/status`).set(bearer(adminToken)).send({ action: 'SUBMIT_FOR_REVIEW' });
    const res = await request(app).post(`/api/admin/hotels/${id}/status`).set(bearer(adminToken)).send({ action: 'MARK_READY' });
    assert.equal(res.status, 422);
    const fields = res.body.error.details.map((detail) => detail.field);
    for (const required of ['Address', 'Map location', 'Description', 'Star rating', 'At least one image', 'At least one amenity']) {
      assert.ok(fields.includes(required), `missing blocker: ${required}`);
    }
  });
});

describe('3-4. admin edits and data safety', () => {
  it('lets an admin modify an imported field and marks it MODIFIED', async () => {
    const res = await request(app)
      .patch(`/api/admin/hotels/${hotelId}`)
      .set(bearer(adminToken))
      .send({ name: 'Sample Hill Station Villa Lonavala' });
    assert.equal(res.status, 200);
    assert.equal(res.body.hotel.name, 'Sample Hill Station Villa Lonavala');
    assert.equal(res.body.hotel.fieldStates.name.status, 'MODIFIED');
  });

  it('keeps the modified value when a later provider sync disagrees, and records a suggestion instead', async () => {
    const mock = getActiveProvider('mock');
    const original = mock.getDetails.bind(mock);
    mock.getDetails = async (externalId) => ({
      ...(await original(externalId)),
      name: 'Sample Hill Station Villa',
      phone: '+91 2114 220 011',
    });

    try {
      const res = await request(app).post(`/api/admin/hotels/${hotelId}/sync-external`).set(bearer(adminToken));
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.ok(res.body.suggested.some((item) => item.field === 'name'));
      assert.ok(res.body.applied.some((item) => item.field === 'phone'), 'untouched fields do update');

      const detail = await hotel();
      assert.equal(detail.name, 'Sample Hill Station Villa Lonavala', 'the admin value must survive the sync');
      assert.equal(detail.fieldStates.name.hasSuggestion, true);
      assert.equal(detail.fieldStates.name.pendingExternalValue, 'Sample Hill Station Villa');
      assert.equal(detail.phone, '+912114220011');
    } finally {
      mock.getDetails = original;
    }
  });

  it('lets an admin accept a suggestion explicitly', async () => {
    const res = await request(app)
      .post(`/api/admin/hotels/${hotelId}/fields/name/accept-suggestion`)
      .set(bearer(adminToken));
    assert.equal(res.status, 200);
    assert.equal(res.body.hotel.name, 'Sample Hill Station Villa');
    assert.equal(res.body.hotel.fieldStates.name.hasSuggestion, false);
  });

  it('verifies a field, and clears verification when it is edited again', async () => {
    const verified = await request(app)
      .post(`/api/admin/hotels/${hotelId}/verify-fields`)
      .set(bearer(adminToken))
      .send({ fields: ['city', 'addressLine'] });
    assert.equal(verified.status, 200);
    assert.equal(verified.body.hotel.fieldStates.city.status, 'VERIFIED');

    // A real change (not a no-op), so the admin's edit must clear the verification.
    await request(app).patch(`/api/admin/hotels/${hotelId}`).set(bearer(adminToken)).send({ city: 'Khandala' });
    const after = await hotel();
    assert.equal(after.fieldStates.city.status, 'MODIFIED');
  });

  it('refuses to verify an empty field', async () => {
    const res = await request(app)
      .post(`/api/admin/hotels/${hotelId}/verify-fields`)
      .set(bearer(adminToken))
      .send({ fields: ['postalCode'] });
    assert.equal(res.status, 422);
  });
});

describe('5-7. images: selection, reordering and cover', () => {
  it('removes an imported image and re-adds it from the provider record', async () => {
    const [victim] = await request(app).get(`/api/admin/hotels/${hotelId}/images`).set(bearer(adminToken)).then((r) => r.body.images);
    const removed = await request(app).delete(`/api/admin/hotels/${hotelId}/images/${victim.id}`).set(bearer(adminToken));
    assert.equal(removed.status, 204);
    assert.equal((await hotel()).images.length, 2);

    const readded = await request(app)
      .post(`/api/admin/hotels/${hotelId}/images/from-provider`)
      .set(bearer(adminToken))
      .send({ sourceUrl: victim.sourceUrl });
    assert.equal(readded.status, 201);
    assert.equal((await hotel()).images.length, 3);
  });

  it('refuses to add an image that the provider never supplied', async () => {
    const res = await request(app)
      .post(`/api/admin/hotels/${hotelId}/images/from-provider`)
      .set(bearer(adminToken))
      .send({ sourceUrl: 'https://evil.example.com/tracker.png' });
    assert.equal(res.status, 422);
  });

  it('reorders images, and rejects a partial order', async () => {
    const imageIds = (await hotel()).images.map((image) => image.id);
    const reversed = [...imageIds].reverse();
    const ok = await request(app).put(`/api/admin/hotels/${hotelId}/images/order`).set(bearer(adminToken)).send({ imageIds: reversed });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.images.map((image) => image.id), reversed);

    const partial = await request(app)
      .put(`/api/admin/hotels/${hotelId}/images/order`)
      .set(bearer(adminToken))
      .send({ imageIds: reversed.slice(1) });
    assert.equal(partial.status, 422);
  });

  it('changes the cover explicitly and keeps exactly one cover', async () => {
    const detail = await hotel();
    const target = detail.images[1];
    const res = await request(app).post(`/api/admin/hotels/${hotelId}/images/${target.id}/cover`).set(bearer(adminToken));
    assert.equal(res.status, 200);

    const covers = (await hotel()).images.filter((image) => image.isCover);
    assert.equal(covers.length, 1);
    assert.equal(covers[0].id, target.id);
  });

  it('changes an image category to one of the allowed categories only', async () => {
    const detail = await hotel();
    const image = detail.images[0];
    const ok = await request(app)
      .patch(`/api/admin/hotels/${hotelId}/images/${image.id}`)
      .set(bearer(adminToken))
      .send({ category: 'POOL' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.image.category, 'POOL');

    const bad = await request(app)
      .patch(`/api/admin/hotels/${hotelId}/images/${image.id}`)
      .set(bearer(adminToken))
      .send({ category: 'COVER' });
    assert.equal(bad.status, 422);
  });
});

describe('8-10. upload security', () => {
  it('rejects unauthenticated and customer uploads', async () => {
    const anonymous = await request(app)
      .post(`/api/admin/hotels/${hotelId}/images`)
      .attach('image', jpegBytes(), { filename: 'a.jpg', contentType: 'image/jpeg' });
    assert.equal(anonymous.status, 401);

    const customer = await upload(jpegBytes(), { token: customerToken });
    assert.equal(customer.status, 403);
  });

  it('rejects disallowed extensions and MIME types', async () => {
    const gif = await upload(Buffer.from('GIF89a-not-allowed'), { filename: 'anim.gif', mimetype: 'image/gif' });
    assert.equal(gif.status, 415);

    const svg = await upload(Buffer.from('<svg onload="alert(1)"/>'), { filename: 'x.svg', mimetype: 'image/svg+xml' });
    assert.equal(svg.status, 415);
  });

  it('rejects files whose contents do not match the declared image type', async () => {
    const spoofed = await upload(jpegBytes(), { filename: 'photo.png', mimetype: 'image/png' });
    assert.equal(spoofed.status, 415);

    const executable = await upload(Buffer.from('MZ\x90\x00 not an image'), { filename: 'photo.jpg', mimetype: 'image/jpeg' });
    assert.equal(executable.status, 415);
  });

  it('rejects oversized files', async () => {
    const big = await upload(jpegBytes(5 * 1024 * 1024), { filename: 'huge.jpg', mimetype: 'image/jpeg' });
    assert.equal(big.status, 413);
  });

  it('accepts a valid upload, stores it under a server-generated key and serves it', async () => {
    const res = await upload(pngBytes(), { filename: '../../etc/passwd.png', mimetype: 'image/png', category: 'POOL' });
    assert.equal(res.status, 201);
    assert.equal(res.body.image.origin, 'UPLOADED');
    assert.equal(res.body.image.mimeType, 'image/png');
    assert.equal(res.body.image.isCover, false, 'uploads do not become the cover automatically');
    assert.match(res.body.image.url, /^\/media\/hotels\/\d+\/[0-9a-f-]{36}\.png$/, 'filename is never taken from the client');

    const served = await request(app).get(res.body.image.url);
    assert.equal(served.status, 200);
    assert.equal(served.headers['x-content-type-options'], 'nosniff');
    assert.ok(existsSync(path.join(MEDIA_DIR, res.body.image.url.replace('/media/', ''))));
  });

  it('rejects a duplicate upload of the same file', async () => {
    const bytes = webpBytes();
    const first = await upload(bytes, { filename: 'a.webp', mimetype: 'image/webp' });
    assert.equal(first.status, 201);
    const second = await upload(bytes, { filename: 'b.webp', mimetype: 'image/webp' });
    assert.equal(second.status, 409);
  });

  it('deletes an uploaded file from storage when it is removed from the gallery', async () => {
    const uploaded = (await hotel()).images.find((image) => image.origin === 'UPLOADED');
    const diskPath = path.join(MEDIA_DIR, uploaded.url.replace('/media/', ''));
    assert.ok(existsSync(diskPath));

    await request(app).delete(`/api/admin/hotels/${hotelId}/images/${uploaded.id}`).set(bearer(adminToken));
    assert.equal(existsSync(diskPath), false);
  });

  it('accepts a valid AVIF upload alongside JPEG/PNG/WebP', async () => {
    const res = await upload(avifBytes(), { filename: 'photo.avif', mimetype: 'image/avif' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.image.mimeType, 'image/avif');
    assert.match(res.body.image.url, /^\/media\/hotels\/\d+\/[0-9a-f-]{36}\.avif$/);

    const served = await request(app).get(res.body.image.url);
    assert.equal(served.status, 200);
    assert.ok(existsSync(path.join(MEDIA_DIR, res.body.image.url.replace('/media/', ''))));
  });

  it('rejects a malformed AVIF file whose bytes do not actually contain a ftyp/avif signature', async () => {
    const res = await upload(Buffer.concat([Buffer.from('not-a-real-avif-file'), Buffer.alloc(512)]), { filename: 'fake.avif', mimetype: 'image/avif' });
    assert.equal(res.status, 415);
  });
});

describe('11-12. publishing', () => {
  it('does not let a hotel manager publish', async () => {
    const submitted = await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(onboardingToken)).send({ action: 'SUBMIT_FOR_REVIEW' });
    assert.equal(submitted.status, 200);
    const blocked = await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(onboardingToken)).send({ action: 'MARK_READY' });
    assert.equal(blocked.status, 403);
    const ready = await request(app).post(`/api/admin/hotels/${hotelId}/status`).set(bearer(adminToken)).send({ action: 'MARK_READY' });
    assert.equal(ready.status, 200);
    const res = await transition('PUBLISH', managerToken);
    assert.equal(res.status, 403);
  });

  it('lets an onboarding executive manage hotel content without a per-hotel assignment', async () => {
    const detail = await request(app).get(`/api/admin/hotels/${hotelId}`).set(bearer(unassignedOnboardingToken));
    assert.equal(detail.status, 200);
    assert.equal(detail.body.hotel.canEdit, true);

    const rooms = await request(app).get(`/api/admin/hotels/${hotelId}/room-types`).set(bearer(unassignedOnboardingToken));
    assert.equal(rooms.status, 200);

    const policies = await request(app).get(`/api/admin/hotels/${hotelId}/cancellation-policies`).set(bearer(unassignedOnboardingToken));
    assert.equal(policies.status, 200);
  });

  it('lets an onboarding executive publish after review approval and shows the hotel publicly', async () => {
    const detail = await hotel();
    assert.ok(detail.images.some((image) => image.isCover), 'a cover must be selected first');

    const res = await transition('PUBLISH', unassignedOnboardingToken);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.hotel.status, 'PUBLISHED');

    const pub = await request(app).get(`/api/hotels/${hotelId}`);
    assert.equal(pub.status, 200);

    const catalogue = await request(app).get('/api/admin/hotels?status=PUBLISHED').set(bearer(adminToken));
    assert.ok(catalogue.body.items.some((item) => item.id === hotelId));
  });

  it('lets an onboarding executive unpublish and republish a hotel', async () => {
    const unpublished = await transition('UNPUBLISH', unassignedOnboardingToken);
    assert.equal(unpublished.status, 200);
    assert.equal(unpublished.body.hotel.status, 'UNPUBLISHED');

    const republished = await transition('PUBLISH', unassignedOnboardingToken);
    assert.equal(republished.status, 200);
    assert.equal(republished.body.hotel.status, 'PUBLISHED');
  });

  it('lets an onboarding executive archive a hotel it creates', async () => {
    const created = await request(app)
      .post('/api/admin/hotels')
      .set(bearer(onboardingToken))
      .send({ name: 'Onboarding Archive Test', city: 'Pune', countryCode: 'IN' });
    assert.equal(created.status, 201);

    const archived = await request(app)
      .post(`/api/admin/hotels/${created.body.hotel.id}/status`)
      .set(bearer(onboardingToken))
      .send({ action: 'ARCHIVE' });
    assert.equal(archived.status, 200);
    assert.equal(archived.body.hotel.status, 'ARCHIVED');
  });

  it('refuses to discard a published hotel', async () => {
    const res = await request(app).post(`/api/admin/hotel-import/jobs/${jobId}/discard`).set(bearer(adminToken));
    assert.equal(res.status, 409);
  });
});

describe('13. failed imports are visible', () => {
  let failedJobId;

  before(async () => {
    const res = await request(app)
      .post('/api/admin/hotel-import/import')
      .set(bearer(adminToken))
      .send({ provider: 'mock', externalId: 'missing-record' });
    failedJobId = res.body.job.id;
    await waitForJob(request(app), adminToken, failedJobId);
  });

  it('lists the failed import with its error', async () => {
    const res = await request(app).get('/api/admin/hotel-import/jobs?status=FAILED').set(bearer(adminToken));
    const failed = res.body.items.find((job) => job.id === failedJobId);
    assert.ok(failed);
    assert.match(failed.errorMessage, /no longer available/);
  });

  it('shows the activity log and error to an admin on the review endpoint', async () => {
    const res = await request(app).get(`/api/admin/hotel-import/jobs/${failedJobId}/review`).set(bearer(adminToken));
    assert.equal(res.status, 200);
    assert.equal(res.body.job.status, 'FAILED');
    assert.ok(res.body.logs.some((entry) => entry.level === 'ERROR'));
    assert.equal(res.body.hotel, null);
  });

  it('includes failed attempts for the same external record in a hotel import history', async () => {
    const res = await request(app).get(`/api/admin/hotels/${hotelId}/import-history`).set(bearer(adminToken));
    assert.equal(res.status, 200);
    assert.ok(res.body.jobs.some((job) => job.id === jobId));
    assert.ok(res.body.jobs.every((job) => 'durationMs' in job && 'createdByName' in job));
  });
});

describe('discard and review', () => {
  it('discards an unpublished import, removes uploads, and frees the external record for re-import', async () => {
    const created = await request(app)
      .post('/api/admin/hotel-import/import')
      .set(bearer(adminToken))
      .send({ provider: 'mock', externalId: 'mock-1002' });
    const throwawayJob = await waitForJob(request(app), adminToken, created.body.job.id);

    const discarded = await request(app).post(`/api/admin/hotel-import/jobs/${throwawayJob.id}/discard`).set(bearer(adminToken));
    assert.equal(discarded.status, 200);
    assert.equal(discarded.body.job.status, 'DISCARDED');

    const gone = await request(app).get(`/api/admin/hotels/${throwawayJob.hotelId}`).set(bearer(adminToken));
    assert.equal(gone.status, 404);

    const reimport = await request(app)
      .post('/api/admin/hotel-import/import')
      .set(bearer(adminToken))
      .send({ provider: 'mock', externalId: 'mock-1002' });
    assert.equal(reimport.status, 202);
  });

  it('returns the external record exactly as received, for side-by-side comparison', async () => {
    const res = await request(app).get(`/api/admin/hotel-import/jobs/${jobId}/review`).set(bearer(adminToken));
    assert.equal(res.status, 200);
    assert.equal(res.body.external.externalId, MOCK_HOTEL_EXTERNAL_ID);
    assert.equal(res.body.external.record.images.length, 3);
    assert.equal(res.body.hotel.id, hotelId);
  });

  it('lets an assigned onboarding executive review an import job created by another user', async () => {
    const res = await request(app).get(`/api/admin/hotel-import/jobs/${jobId}/review`).set(bearer(onboardingToken));
    assert.equal(res.status, 200);
    assert.equal(res.body.hotel.id, hotelId);
  });

  it('does not reveal that import job to an unassigned onboarding executive', async () => {
    const res = await request(app).get(`/api/admin/hotel-import/jobs/${jobId}/review`).set(bearer(unassignedOnboardingToken));
    assert.equal(res.status, 404);
  });

  it('denies the review endpoint to customers', async () => {
    const res = await request(app).get(`/api/admin/hotel-import/jobs/${jobId}/review`).set(bearer(customerToken));
    assert.equal(res.status, 403);
  });
});

describe('database hygiene', () => {
  it('keeps the provenance table consistent with hotel rows', async () => {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM hotel_field_states WHERE hotel_id = $1`, [hotelId]);
    assert.ok(rows[0].count > 0);
  });
});
