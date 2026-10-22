import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';

const PASSWORD = 'Strong-pass-123';
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

let app;
let customerToken, otherCustomerToken, adminToken;

before(async () => {
  app = await prepareTestDatabase();
  await createUserWithRole({ email: 'presence.customer@test.gokaasa.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  await createUserWithRole({ email: 'presence.other@test.gokaasa.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  await createUserWithRole({ email: 'presence.admin@test.gokaasa.com', password: PASSWORD, roleCode: 'ADMIN' });

  customerToken = (await request(app).post('/api/auth/login').send({ email: 'presence.customer@test.gokaasa.com', password: PASSWORD })).body.accessToken;
  otherCustomerToken = (await request(app).post('/api/auth/login').send({ email: 'presence.other@test.gokaasa.com', password: PASSWORD })).body.accessToken;
  adminToken = (await request(app).post('/api/auth/login').send({ email: 'presence.admin@test.gokaasa.com', password: PASSWORD })).body.accessToken;
});

after(closeTestDatabase);

describe('presence self-service', () => {
  it('refuses to start a session without authentication', async () => {
    const res = await request(app).post('/api/presence/session').send({ platform: 'web' });
    assert.equal(res.status, 401);
  });

  it('starts a session, heartbeats it, and the current page is visible to an admin', async () => {
    const start = await request(app).post('/api/presence/session').set(bearer(customerToken)).send({ platform: 'web', route: '/' });
    assert.equal(start.status, 201);
    const sessionId = start.body.session.sessionId;
    assert.ok(sessionId);

    const heartbeat = await request(app)
      .post('/api/presence/heartbeat')
      .set(bearer(customerToken))
      .send({ sessionId, route: '/hotels/mumbai/taj-palace-colaba' });
    assert.equal(heartbeat.status, 200);

    const me = (await request(app).get('/api/auth/me').set(bearer(customerToken))).body.user;
    const admin = await request(app).get(`/api/admin/users/${me.id}`).set(bearer(adminToken));
    assert.equal(admin.status, 200);
    assert.equal(admin.body.user.session.route, '/hotels/:citySlug/:hotelSlug');
    assert.equal(admin.body.user.session.routeLabel, 'Hotel Details');
    assert.equal(admin.body.user.presenceStatus, 'online');
  });

  it('never lets one authenticated user heartbeat or end another user\'s session (ownership, not just a shared secret)', async () => {
    const start = await request(app).post('/api/presence/session').set(bearer(customerToken)).send({ platform: 'web' });
    const sessionId = start.body.session.sessionId;

    const foreignHeartbeat = await request(app).post('/api/presence/heartbeat').set(bearer(otherCustomerToken)).send({ sessionId, route: '/wishlist' });
    assert.equal(foreignHeartbeat.status, 404);

    const foreignEnd = await request(app).post('/api/presence/session/end').set(bearer(otherCustomerToken)).send({ sessionId });
    assert.equal(foreignEnd.status, 200);
    assert.equal(foreignEnd.body.ended, false);
  });

  it('ending a session stops further heartbeats from succeeding', async () => {
    const start = await request(app).post('/api/presence/session').set(bearer(customerToken)).send({ platform: 'web' });
    const sessionId = start.body.session.sessionId;

    const end = await request(app).post('/api/presence/session/end').set(bearer(customerToken)).send({ sessionId });
    assert.equal(end.status, 200);
    assert.equal(end.body.ended, true);

    const heartbeatAfterEnd = await request(app).post('/api/presence/heartbeat').set(bearer(customerToken)).send({ sessionId, route: '/' });
    assert.equal(heartbeatAfterEnd.status, 404);
  });

  it('rejects an out-of-range platform and a malformed route', async () => {
    const badPlatform = await request(app).post('/api/presence/session').set(bearer(customerToken)).send({ platform: 'desktop-app' });
    assert.equal(badPlatform.status, 422);

    const badRoute = await request(app).post('/api/presence/session').set(bearer(customerToken)).send({ platform: 'web', route: 'not-a-path' });
    assert.equal(badRoute.status, 422);
  });
});
