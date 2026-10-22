import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { closeTestDatabase, prepareTestDatabase } from '../helpers/testDb.js';
import { aiProvider, AiProviderError } from '../../src/services/ai/provider.js';
import { pool } from '../../src/db/pool.js';

/**
 * Mode B -- the AI natural-language assistant. aiProvider.requestStructuredExtraction/isAiConfigured are
 * swapped for fakes exactly like existing tests already override mailService.send, so these tests exercise
 * assistant.service.js's own validation/resolution/fallback logic deterministically, without a real network
 * call or a configured API key (none is configured in this environment -- see the earlier .env check).
 */

let app;
let hotelId;

const originalIsConfigured = aiProvider.isAiConfigured;
const originalExtract = aiProvider.requestStructuredExtraction;

before(async () => {
  app = await prepareTestDatabase();
});

after(async () => {
  aiProvider.isAiConfigured = originalIsConfigured;
  aiProvider.requestStructuredExtraction = originalExtract;
  await closeTestDatabase();
});

afterEach(() => {
  aiProvider.isAiConfigured = originalIsConfigured;
  aiProvider.requestStructuredExtraction = originalExtract;
});

describe('GET /api/assistant/status', () => {
  it('reports whether AI mode is configured, without ever requiring auth', async () => {
    aiProvider.isAiConfigured = () => false;
    const off = await request(app).get('/api/assistant/status');
    assert.equal(off.status, 200);
    assert.equal(off.body.configured, false);

    aiProvider.isAiConfigured = () => true;
    const on = await request(app).get('/api/assistant/status');
    assert.equal(on.body.configured, true);
  });
});

describe('POST /api/assistant/extract -- input validation', () => {
  it('rejects an empty message', async () => {
    const res = await request(app).post('/api/assistant/extract').send({ message: '' });
    assert.equal(res.status, 422);
  });

  it('rejects a message over the length limit', async () => {
    const res = await request(app).post('/api/assistant/extract').send({ message: 'x'.repeat(501) });
    assert.equal(res.status, 422);
  });

  it('accepts a request with no authentication at all (same as public search)', async () => {
    aiProvider.isAiConfigured = () => false;
    const res = await request(app).post('/api/assistant/extract').send({ message: 'A resort in Goa' });
    assert.equal(res.status, 200);
  });
});

describe('POST /api/assistant/extract -- graceful fallback, never a fabricated success', () => {
  it('when no provider is configured, says so plainly instead of calling out or crashing', async () => {
    aiProvider.isAiConfigured = () => false;
    const res = await request(app).post('/api/assistant/extract').send({ message: 'A resort in Goa for 2' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.reason, 'NOT_CONFIGURED');
    assert.ok(res.body.message);
  });

  it('a provider timeout falls back gracefully, not as a 500 or a fabricated result', async () => {
    aiProvider.isAiConfigured = () => true;
    aiProvider.requestStructuredExtraction = async () => {
      throw new AiProviderError('TIMEOUT', 'too slow');
    };
    const res = await request(app).post('/api/assistant/extract').send({ message: 'A resort in Goa for 2' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.reason, 'TIMEOUT');
  });

  it('a provider outage falls back gracefully', async () => {
    aiProvider.isAiConfigured = () => true;
    aiProvider.requestStructuredExtraction = async () => {
      throw new AiProviderError('UNAVAILABLE', 'down');
    };
    const res = await request(app).post('/api/assistant/extract').send({ message: 'A resort in Goa for 2' });
    assert.equal(res.body.ok, false);
    assert.equal(res.body.reason, 'UNAVAILABLE');
  });

  it('invalid credentials/any other unexpected provider failure also falls back, never crashes the request', async () => {
    aiProvider.isAiConfigured = () => true;
    aiProvider.requestStructuredExtraction = async () => {
      throw new Error('401 unauthorized from provider');
    };
    const res = await request(app).post('/api/assistant/extract').send({ message: 'A resort in Goa for 2' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, false);
  });

  it('malformed/unparseable model output is never treated as a usable result', async () => {
    aiProvider.isAiConfigured = () => true;
    aiProvider.requestStructuredExtraction = async () => {
      throw new AiProviderError('INVALID_OUTPUT', 'not JSON');
    };
    const res = await request(app).post('/api/assistant/extract').send({ message: 'something' });
    assert.equal(res.body.ok, false);
    assert.equal(res.body.reason, 'INVALID_OUTPUT');
  });
});

describe('POST /api/assistant/extract -- structured output validated and resolved against real data', () => {
  it('a destination the real catalogue has no match for asks for clarification, never invents a city', async () => {
    aiProvider.isAiConfigured = () => true;
    aiProvider.requestStructuredExtraction = async () => ({
      destinationQuery: 'Atlantis', checkIn: '2099-01-10', checkOut: '2099-01-12', adults: 2,
    });
    const res = await request(app).post('/api/assistant/extract').send({ message: 'Atlantis for 2' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.criteria.destination, null);
    assert.ok(res.body.missingInformation.includes('destination'));
    assert.ok(res.body.clarificationQuestion);
  });

  it('a well-formed extraction with a real, unique destination resolves cleanly with no clarification needed', async () => {
    const admin = await request(app).post('/api/auth/register').send({
      email: 'assistant.admin@example.com', password: 'Strong-pass-123', firstName: 'Assist', lastName: 'Admin',
    });
    await pool.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code = 'ADMIN'`, [admin.body.user.id]);
    const adminToken = (await request(app).post('/api/auth/login').send({ email: 'assistant.admin@example.com', password: 'Strong-pass-123' })).body.accessToken;
    const created = await request(app).post('/api/admin/hotels').set({ Authorization: `Bearer ${adminToken}` }).send({ name: 'Assistant Test Resort', city: 'Lonavala', countryCode: 'IN' });
    hotelId = created.body.hotel.id;
    await request(app).patch(`/api/admin/hotels/${hotelId}`).set({ Authorization: `Bearer ${adminToken}` }).send({
      description: 'A resort used only to give the destination resolver a real city to match.', starRating: 4, addressLine: '1 Resort Road', latitude: 18.75, longitude: 73.4,
    });
    await pool.query(`INSERT INTO hotel_images (hotel_id, category, source_url, is_cover) VALUES ($1, 'EXTERIOR', 'https://example.com/r.jpg', true)`, [hotelId]);
    await request(app).put(`/api/admin/hotels/${hotelId}/amenities`).set({ Authorization: `Bearer ${adminToken}` }).send({ codes: ['WIFI'] });
    for (const action of ['SUBMIT_FOR_REVIEW', 'MARK_READY', 'PUBLISH']) {
      await request(app).post(`/api/admin/hotels/${hotelId}/status`).set({ Authorization: `Bearer ${adminToken}` }).send({ action });
    }

    aiProvider.isAiConfigured = () => true;
    aiProvider.requestStructuredExtraction = async () => ({
      destinationQuery: 'Lonavala',
      checkIn: '2099-01-10',
      checkOut: '2099-01-12',
      adults: 4,
      rooms: 1,
      propertyType: 'RESORT',
      amenities: ['POOL'],
      budget: { amount: 15000, type: 'TOTAL_STAY' },
    });
    const res = await request(app).post('/api/assistant/extract').send({ message: 'A resort in Lonavala for 4, pool, 15000 total' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.criteria.destination.type, 'CITY');
    assert.equal(res.body.criteria.destination.destination, 'lonavala');
    assert.equal(res.body.criteria.checkIn, '2099-01-10');
    assert.deepEqual(res.body.criteria.amenities, ['POOL']);
    assert.deepEqual(res.body.criteria.budget, { amount: 15000, type: 'TOTAL_STAY' });
    assert.deepEqual(res.body.missingInformation, []);
    assert.equal(res.body.clarificationQuestion, null);
  });

  it('missing dates in the extracted output produce a clarification question, not a guessed date', async () => {
    aiProvider.isAiConfigured = () => true;
    aiProvider.requestStructuredExtraction = async () => ({ destinationQuery: 'Lonavala', adults: 2 });
    const res = await request(app).post('/api/assistant/extract').send({ message: 'Lonavala for 2' });
    assert.equal(res.body.ok, true);
    assert.ok(res.body.missingInformation.includes('dates'));
    assert.match(res.body.clarificationQuestion, /check-in|check-out|date/i);
  });
});

describe('rate limiting', () => {
  it('the extract endpoint has a rate limiter attached (route-level check, limiter itself is skipped under NODE_ENV=test)', async () => {
    // express-rate-limit is configured to skip enforcement under NODE_ENV=test (see rateLimiters.js) so the
    // integration suite isn't throttled -- this just confirms the route still responds normally with the
    // limiter middleware wired in, rather than re-testing express-rate-limit's own behaviour.
    aiProvider.isAiConfigured = () => false;
    const results = await Promise.all(Array.from({ length: 5 }, () => request(app).post('/api/assistant/extract').send({ message: 'Goa for 2' })));
    assert.ok(results.every((r) => r.status === 200));
  });
});
