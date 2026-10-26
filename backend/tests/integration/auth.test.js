import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';
import { mailService } from '../../src/services/mail.service.js';

const PASSWORD = 'Strong-pass-123';
let app;
const sentMail = [];
const captureMail = async (message) => {
  sentMail.push(message);
  return { messageId: `test-${sentMail.length}`, accepted: [message.to], rejected: [] };
};

function cookieFrom(res) {
  const header = res.headers['set-cookie']?.find((value) => value.startsWith('gk_refresh='));
  return header ? header.split(';')[0] : null;
}

before(async () => {
  app = await prepareTestDatabase();
  mailService.send = captureMail;
});

after(closeTestDatabase);

describe('registration and login', () => {
  beforeEach(() => {
    sentMail.length = 0;
  });

  it('registers a customer, normalises the email and sets an httpOnly refresh cookie', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: '  Asha.Test@Example.com ', password: PASSWORD, firstName: 'Asha', lastName: 'Kumar' });

    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, 'asha.test@example.com');
    assert.deepEqual(res.body.user.roles, ['CUSTOMER']);
    assert.ok(res.body.accessToken);
    assert.equal(res.body.refreshToken, undefined, 'refresh token must never be in the JSON body');

    const setCookie = res.headers['set-cookie'][0];
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    assert.match(setCookie, /Path=\/api\/auth/);
    assert.equal(sentMail.length, 1);
    assert.equal(sentMail[0].to, 'asha.test@example.com');
    assert.equal(sentMail[0].subject, 'Welcome to Gokaasa! Your account is ready');
    assert.match(sentMail[0].html, /Welcome, Asha!/);
  });

  it('rejects duplicate emails regardless of case', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'ASHA.test@example.com', password: PASSWORD, firstName: 'Asha', lastName: 'Kumar' });
    assert.equal(res.status, 409);
    assert.equal(sentMail.length, 0, 'a failed duplicate registration must not send another welcome email');
  });

  it('keeps the account authoritative when SMTP delivery fails and records a retryable delivery', async () => {
    mailService.send = async () => { throw new Error('temporary provider outage'); };
    try {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'smtp.failure@example.com', password: PASSWORD, firstName: 'Mail', lastName: 'Failure' });
      assert.equal(res.status, 201);
      const delivery = await (await import('../../src/db/pool.js')).pool.query(
        `SELECT status, attempt_count, last_error FROM email_deliveries WHERE event_key = $1`,
        [`customer.registered:${res.body.user.id}`],
      );
      assert.equal(delivery.rows[0].status, 'FAILED');
      assert.equal(delivery.rows[0].attempt_count, 1);
      assert.match(delivery.rows[0].last_error, /temporary provider outage/);
    } finally {
      mailService.send = captureMail;
    }
  });

  it('returns field-level validation errors without revealing internals', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'short', firstName: '', lastName: 'K' });

    assert.equal(res.status, 422);
    const fields = res.body.error.details.map((detail) => detail.field);
    assert.ok(fields.includes('body.email'));
    assert.ok(fields.includes('body.password'));
    assert.ok(fields.includes('body.firstName'));
    assert.doesNotMatch(JSON.stringify(res.body), /stack|SQL|pg_/i);
  });

  it('gives the same generic message for unknown email and wrong password', async () => {
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: PASSWORD });
    const wrong = await request(app).post('/api/auth/login').send({ email: 'asha.test@example.com', password: 'Wrong-pass-123' });

    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(unknown.body.error.message, wrong.body.error.message);
  });

  it('logs in and returns the profile through /me', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'asha.test@example.com', password: PASSWORD });
    assert.equal(login.status, 200);

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.firstName, 'Asha');
  });

  it('requires a bearer token for protected routes', async () => {
    const res = await request(app).get('/api/auth/me');
    assert.equal(res.status, 401);
  });
});

describe('refresh token rotation', () => {
  it('rotates the refresh cookie on every refresh', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'asha.test@example.com', password: PASSWORD });
    const first = cookieFrom(login);

    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', first);
    assert.equal(refreshed.status, 200);
    const second = cookieFrom(refreshed);
    assert.notEqual(second, first);
  });

  it('treats replay of a rotated token as theft and revokes every session', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'asha.test@example.com', password: PASSWORD });
    const stolen = cookieFrom(login);

    const legitimate = await request(app).post('/api/auth/refresh').set('Cookie', stolen);
    const current = cookieFrom(legitimate);

    const replay = await request(app).post('/api/auth/refresh').set('Cookie', stolen);
    assert.equal(replay.status, 401);
    assert.match(replay.body.error.message, /closed for your security/);

    const afterReplay = await request(app).post('/api/auth/refresh').set('Cookie', current);
    assert.equal(afterReplay.status, 401, 'the legitimate session must be revoked too');
  });

  it('logout revokes the refresh token and clears the cookie', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'asha.test@example.com', password: PASSWORD });
    const cookie = cookieFrom(login);

    const logout = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    assert.equal(logout.status, 204);
    assert.match(logout.headers['set-cookie'][0], /gk_refresh=;/);

    const after = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    assert.equal(after.status, 401);
  });
});

describe('password reset', () => {
  beforeEach(() => {
    sentMail.length = 0;
  });

  function tokenFromLastMail() {
    const link = sentMail.at(-1).text.match(/reset-password\?token=([^\s]+)/)[1];
    return decodeURIComponent(link);
  }

  it('answers identically for unknown emails so accounts cannot be enumerated', async () => {
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@example.com' });
    assert.equal(unknown.status, 202);
    assert.equal(sentMail.length, 0);
  });

  it('sends a single-use reset link that signs out all sessions', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'asha.test@example.com', password: PASSWORD });
    const oldCookie = cookieFrom(login);

    await request(app).post('/api/auth/forgot-password').send({ email: 'asha.test@example.com' });
    const token = tokenFromLastMail();

    const newPassword = 'Another-pass-456';
    const reset = await request(app).post('/api/auth/reset-password').send({ token, password: newPassword });
    assert.equal(reset.status, 200);

    const reused = await request(app).post('/api/auth/reset-password').send({ token, password: 'Third-pass-789' });
    assert.equal(reused.status, 400);

    const oldSession = await request(app).post('/api/auth/refresh').set('Cookie', oldCookie);
    assert.equal(oldSession.status, 401);

    const relogin = await request(app).post('/api/auth/login').send({ email: 'asha.test@example.com', password: newPassword });
    assert.equal(relogin.status, 200);
  });
});

describe('role-based access control', () => {
  it('denies customers access to admin routes', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'asha.test@example.com', password: 'Another-pass-456' });
    const res = await request(app).get('/api/admin/hotels').set('Authorization', `Bearer ${login.body.accessToken}`);
    assert.equal(res.status, 403);
  });

  it('allows an administrator through and lets hotel managers in too', async () => {
    await createUserWithRole({ email: 'admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
    await createUserWithRole({ email: 'manager@example.com', password: PASSWORD, roleCode: 'HOTEL_MANAGER' });

    for (const email of ['admin@example.com', 'manager@example.com']) {
      const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
      const res = await request(app).get('/api/admin/hotels').set('Authorization', `Bearer ${login.body.accessToken}`);
      assert.equal(res.status, 200, `${email} should reach admin routes`);
    }
  });
});
