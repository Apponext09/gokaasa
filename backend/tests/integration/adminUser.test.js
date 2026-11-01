import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';
import { pool } from '../../src/db/pool.js';

const PASSWORD = 'Strong-pass-123';
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

let app;
let customerId, customerToken, managerToken, adminToken, otherCustomerId, otherCustomerToken;

before(async () => {
  app = await prepareTestDatabase();
  customerId = await createUserWithRole({ email: 'admusr.customer@test.gokaasa.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  otherCustomerId = await createUserWithRole({ email: 'admusr.other@test.gokaasa.com', password: PASSWORD, roleCode: 'CUSTOMER' });
  await createUserWithRole({ email: 'admusr.owner@test.gokaasa.com', password: PASSWORD, roleCode: 'HOTEL_OWNER' });
  await createUserWithRole({ email: 'admusr.admin@test.gokaasa.com', password: PASSWORD, roleCode: 'ADMIN' });

  customerToken = (await request(app).post('/api/auth/login').send({ email: 'admusr.customer@test.gokaasa.com', password: PASSWORD })).body.accessToken;
  otherCustomerToken = (await request(app).post('/api/auth/login').send({ email: 'admusr.other@test.gokaasa.com', password: PASSWORD })).body.accessToken;
  managerToken = (await request(app).post('/api/auth/login').send({ email: 'admusr.owner@test.gokaasa.com', password: PASSWORD })).body.accessToken;
  adminToken = (await request(app).post('/api/auth/login').send({ email: 'admusr.admin@test.gokaasa.com', password: PASSWORD })).body.accessToken;
});

after(closeTestDatabase);

describe('GET /api/admin/users -- authorization', () => {
  it('refuses an unauthenticated caller', async () => {
    assert.equal((await request(app).get('/api/admin/users')).status, 401);
  });

  it('refuses an ordinary customer', async () => {
    assert.equal((await request(app).get('/api/admin/users').set(bearer(customerToken))).status, 403);
  });

  it('refuses a hotel owner -- this directory can reveal other staff accounts, unlike /admin/customers', async () => {
    assert.equal((await request(app).get('/api/admin/users').set(bearer(managerToken))).status, 403);
  });

  it('allows an admin and returns every role, paginated', async () => {
    const res = await request(app).get('/api/admin/users').set(bearer(adminToken)).query({ limit: 50 });
    assert.equal(res.status, 200);
    const emails = res.body.items.map((u) => u.email);
    assert.ok(emails.includes('admusr.customer@test.gokaasa.com'));
    assert.ok(emails.includes('admusr.owner@test.gokaasa.com'));
    assert.ok(emails.includes('admusr.admin@test.gokaasa.com'));
    assert.ok(res.body.pagination.total >= 3);
  });
});

describe('POST /api/admin/users/staff', () => {
  it('lets an admin create fixed login credentials with a restricted staff role', async () => {
    const res = await request(app).post('/api/admin/users/staff').set(bearer(adminToken)).send({
      firstName: 'Sales', lastName: 'Executive', email: 'sales.created@test.gokaasa.com',
      phone: '9876543210', password: PASSWORD, role: 'SALES_EXECUTIVE',
    });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.user.roles, ['SALES_EXECUTIVE']);
    const login = await request(app).post('/api/auth/login').send({ email: 'sales.created@test.gokaasa.com', password: PASSWORD });
    assert.equal(login.status, 200);
    assert.deepEqual(login.body.user.roles, ['SALES_EXECUTIVE']);
  });

  it('does not let a hotel owner create staff credentials', async () => {
    const res = await request(app).post('/api/admin/users/staff').set(bearer(managerToken)).send({
      firstName: 'No', lastName: 'Access', email: 'blocked.staff@test.gokaasa.com', password: PASSWORD, role: 'SALES_EXECUTIVE',
    });
    assert.equal(res.status, 403);
  });

  it('rejects the retired HOTEL_MANAGER role', async () => {
    const res = await request(app).post('/api/admin/users/staff').set(bearer(adminToken)).send({
      firstName: 'Retired', lastName: 'Role', email: 'retired.role@test.gokaasa.com',
      phone: '9876543211', password: PASSWORD, role: 'HOTEL_MANAGER',
    });
    assert.equal(res.status, 422);
  });
});

describe('GET /api/admin/users -- search, filter, sort', () => {
  it('filters by role', async () => {
    const res = await request(app).get('/api/admin/users').set(bearer(adminToken)).query({ role: 'ADMIN', limit: 50 });
    assert.ok(res.body.items.every((u) => u.roles.includes('ADMIN')));
    assert.ok(res.body.items.some((u) => u.email === 'admusr.admin@test.gokaasa.com'));
  });

  it('searches by email', async () => {
    const res = await request(app).get('/api/admin/users').set(bearer(adminToken)).query({ q: 'admusr.owner' });
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].email, 'admusr.owner@test.gokaasa.com');
  });

  it('rejects an unsupported role or sort value instead of silently ignoring it', async () => {
    const res = await request(app).get('/api/admin/users').set(bearer(adminToken)).query({ role: 'SUPERADMIN' });
    assert.equal(res.status, 422);
  });
});

describe('PATCH /api/admin/users/:id/status', () => {
  it('requires admin authorization', async () => {
    const res = await request(app).patch(`/api/admin/users/${customerId}/status`).set(bearer(managerToken)).send({ isActive: false });
    assert.equal(res.status, 403);
  });

  it('deactivating revokes every refresh token and records an audit entry', async () => {
    const res = await request(app).patch(`/api/admin/users/${customerId}/status`).set(bearer(adminToken)).send({ isActive: false });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.isActive, false);

    const { rows } = await pool.query('SELECT revoked_at FROM refresh_tokens WHERE user_id = $1', [customerId]);
    assert.ok(rows.length > 0 && rows.every((r) => r.revoked_at != null));

    const audit = await pool.query(`SELECT action FROM audit_logs WHERE entity = 'user' AND entity_id = $1 ORDER BY id DESC LIMIT 1`, [String(customerId)]);
    assert.equal(audit.rows[0].action, 'user.deactivated');

    // Reactivate so later tests/suites are unaffected by this suite's ordering.
    await request(app).patch(`/api/admin/users/${customerId}/status`).set(bearer(adminToken)).send({ isActive: true });
  });
});

describe('GET /api/admin/users/kpis', () => {
  it('reports non-negative counts derived from real data, never a hardcoded shape', async () => {
    const res = await request(app).get('/api/admin/users/kpis').set(bearer(adminToken));
    assert.equal(res.status, 200);
    for (const key of ['totalUsers', 'onlineNow', 'offlineUsers', 'newUsersToday', 'activeSessions']) {
      assert.equal(typeof res.body[key], 'number');
      assert.ok(res.body[key] >= 0);
    }
    assert.ok(res.body.totalUsers >= 3);
  });
});

describe('POST /api/admin/users/:id/force-signout', () => {
  it('revokes refresh tokens without requiring a "suspended" status that does not exist in this schema', async () => {
    await request(app).post('/api/presence/session').set(bearer(customerToken)).send({ platform: 'web' });
    const res = await request(app).post(`/api/admin/users/${customerId}/force-signout`).set(bearer(adminToken));
    assert.equal(res.status, 200);
    assert.equal(res.body.signedOut, true);
  });
});

describe('DELETE /api/admin/users/:id/sessions/:sessionId', () => {
  it('ends the session, records an audit entry atomically, and a later heartbeat from the owner 404s', async () => {
    const start = await request(app).post('/api/presence/session').set(bearer(customerToken)).send({ platform: 'web' });
    const sessionId = start.body.session.sessionId;

    const res = await request(app).delete(`/api/admin/users/${customerId}/sessions/${sessionId}`).set(bearer(adminToken));
    assert.equal(res.status, 200);
    assert.equal(res.body.ended, true);

    const audit = await pool.query(`SELECT action FROM audit_logs WHERE entity = 'user_session' AND entity_id = $1 ORDER BY id DESC LIMIT 1`, [String(sessionId)]);
    assert.equal(audit.rows[0].action, 'user.session_revoked');

    const heartbeat = await request(app).post('/api/presence/heartbeat').set(bearer(customerToken)).send({ sessionId, route: '/' });
    assert.equal(heartbeat.status, 404);
  });

  it('refuses to revoke a session that belongs to a DIFFERENT user than the one named in the URL (IDOR)', async () => {
    const start = await request(app).post('/api/presence/session').set(bearer(otherCustomerToken)).send({ platform: 'web' });
    const sessionId = start.body.session.sessionId;

    // customerId's own id is used in the URL, but the session actually belongs to otherCustomerId.
    const res = await request(app).delete(`/api/admin/users/${customerId}/sessions/${sessionId}`).set(bearer(adminToken));
    assert.equal(res.status, 404);

    const stillAlive = await request(app).post('/api/presence/heartbeat').set(bearer(otherCustomerToken)).send({ sessionId, route: '/' });
    assert.equal(stillAlive.status, 200);
  });

  it('requires admin authorization', async () => {
    const start = await request(app).post('/api/presence/session').set(bearer(customerToken)).send({ platform: 'web' });
    const sessionId = start.body.session.sessionId;
    const res = await request(app).delete(`/api/admin/users/${customerId}/sessions/${sessionId}`).set(bearer(managerToken));
    assert.equal(res.status, 403);
  });
});

describe('admin SSE stream authorization', () => {
  it('rejects the stream with no ticket', async () => {
    const res = await request(app).get('/api/admin/users/stream');
    assert.equal(res.status, 401);
  });

  it('rejects a made-up ticket', async () => {
    const res = await request(app).get('/api/admin/users/stream').query({ ticket: 'not-a-real-ticket' });
    assert.equal(res.status, 401);
  });

  it('only an admin may mint a stream ticket', async () => {
    assert.equal((await request(app).post('/api/admin/users/stream-ticket').set(bearer(managerToken))).status, 403);
    const res = await request(app).post('/api/admin/users/stream-ticket').set(bearer(adminToken));
    assert.equal(res.status, 200);
    assert.ok(res.body.ticket);
  });
});
