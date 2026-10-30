import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';

const MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'gokaasa-homepage-media-'));
process.env.MEDIA_DIR = MEDIA_DIR;

const PASSWORD = 'Strong-pass-123';
const pngBytes = () => Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(512),
]);

let app;
let adminToken;

before(async () => {
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'homepage.admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
  const login = await request(app).post('/api/auth/login').send({ email: 'homepage.admin@example.com', password: PASSWORD });
  adminToken = login.body.accessToken;
});

after(async () => {
  await closeTestDatabase();
  rmSync(MEDIA_DIR, { recursive: true, force: true });
});

describe('homepage background image text', () => {
  it('stores and publicly returns visible text separately from accessibility text', async () => {
    const uploaded = await request(app)
      .put('/api/admin/homepage-background-images/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('altText', 'A bright hotel room')
      .field('heroText', 'Wake up somewhere unforgettable')
      .attach('image', pngBytes(), { filename: 'hero.png', contentType: 'image/png' });

    assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body));
    assert.equal(uploaded.body.image.altText, 'A bright hotel room');
    assert.equal(uploaded.body.image.heroText, 'Wake up somewhere unforgettable');

    const publicList = await request(app).get('/api/homepage/background-images');
    assert.equal(publicList.status, 200);
    assert.equal(publicList.body.images[0].heroText, 'Wake up somewhere unforgettable');
  });

  it('updates image text without requiring the image to be uploaded again', async () => {
    const before = await request(app).get('/api/homepage/background-images');
    const originalUrl = before.body.images[0].url;

    const updated = await request(app)
      .put('/api/admin/homepage-background-images/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('altText', 'A bright hotel room')
      .field('heroText', 'A new message for this image');

    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.image.heroText, 'A new message for this image');
    assert.equal(updated.body.image.url, originalUrl);
  });

  it('rejects display text longer than the database limit', async () => {
    const result = await request(app)
      .put('/api/admin/homepage-background-images/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('altText', '')
      .field('heroText', 'x'.repeat(161));

    assert.equal(result.status, 422);
  });
});
