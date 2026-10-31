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
    assert.deepEqual(res.body.user.permissions, []);
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

describe('authenticated password change', () => {
  it('verifies the current password, changes it, audits it and revokes every session', async () => {
    const email = 'profile.password@example.com';
    const newPassword = 'Changed-pass-456';
    const userId = await createUserWithRole({ email, password: PASSWORD, roleCode: 'CUSTOMER' });
    const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
    const oldCookie = cookieFrom(login);

    assert.equal((await request(app).post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword })).status, 401);

    const wrong = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ currentPassword: 'Wrong-pass-123', newPassword });
    assert.equal(wrong.status, 400);

    const unchanged = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: PASSWORD });
    assert.equal(unchanged.status, 400);

    const changed = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword });
    assert.equal(changed.status, 200);
    assert.match(changed.headers['set-cookie'][0], /gk_refresh=;/);

    assert.equal((await request(app).post('/api/auth/refresh').set('Cookie', oldCookie)).status, 401);
    assert.equal((await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).status, 401);
    assert.equal((await request(app).post('/api/auth/login').send({ email, password: newPassword })).status, 200);

    const { pool } = await import('../../src/db/pool.js');
    const audit = await pool.query(
      `SELECT new_value FROM audit_logs WHERE action = 'user.password_changed' AND entity_id = $1`,
      [String(userId)],
    );
    assert.equal(audit.rowCount, 1);
    assert.deepEqual(audit.rows[0].new_value, { sessionsRevoked: true });
  });
});

describe('staff email change', () => {
  beforeEach(() => {
    sentMail.length = 0;
  });

  it('rejects CUSTOMER accounts at the authorization boundary', async () => {
    await createUserWithRole({ email: 'email-change.customer@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
    const login = await request(app).post('/api/auth/login').send({ email: 'email-change.customer@example.com', password: PASSWORD });
    const res = await request(app)
      .post('/api/auth/email-change/request')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ newEmail: 'customer.new@example.com', currentPassword: PASSWORD });
    assert.equal(res.status, 403);
    assert.equal(sentMail.length, 0);
  });

  it('verifies a staff email, revokes sessions and records an audit trail', async () => {
    const oldEmail = 'email-change.admin@example.com';
    const newEmail = 'email-change.admin@company.example';
    const userId = await createUserWithRole({ email: oldEmail, password: PASSWORD, roleCode: 'ADMIN' });
    const login = await request(app).post('/api/auth/login').send({ email: oldEmail, password: PASSWORD });
    const token = login.body.accessToken;
    const oldCookie = cookieFrom(login);

    const wrongPassword = await request(app)
      .post('/api/auth/email-change/request')
      .set('Authorization', `Bearer ${token}`)
      .send({ newEmail, currentPassword: 'wrong-password' });
    assert.equal(wrongPassword.status, 400);

    const requested = await request(app)
      .post('/api/auth/email-change/request')
      .set('Authorization', `Bearer ${token}`)
      .send({ newEmail, currentPassword: PASSWORD });
    assert.equal(requested.status, 202);
    assert.equal(requested.body.pending.newEmail, newEmail);
    assert.equal(sentMail.length, 1);
    assert.equal(sentMail[0].to, newEmail);
    const code = sentMail[0].text.match(/Verification code: (\d{6})/)[1];

    const pending = await request(app).get('/api/auth/email-change').set('Authorization', `Bearer ${token}`);
    assert.equal(pending.status, 200);
    assert.equal(pending.body.pending.newEmail, newEmail);

    const incorrect = await request(app)
      .post('/api/auth/email-change/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: code === '000000' ? '111111' : '000000' });
    assert.equal(incorrect.status, 400);
    const { pool } = await import('../../src/db/pool.js');
    const attempts = await pool.query(`SELECT attempts FROM email_change_requests WHERE user_id = $1 AND consumed_at IS NULL`, [userId]);
    assert.equal(attempts.rows[0].attempts, 1, 'a wrong code must consume an attempt even though verification fails');

    const verified = await request(app)
      .post('/api/auth/email-change/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ code });
    assert.equal(verified.status, 200);
    assert.equal(verified.body.email, newEmail);
    assert.match(verified.headers['set-cookie'][0], /gk_refresh=;/);

    const oldSession = await request(app).post('/api/auth/refresh').set('Cookie', oldCookie);
    assert.equal(oldSession.status, 401);
    assert.equal((await request(app).post('/api/auth/login').send({ email: oldEmail, password: PASSWORD })).status, 401);
    assert.equal((await request(app).post('/api/auth/login').send({ email: newEmail, password: PASSWORD })).status, 200);

    const audit = await pool.query(
      `SELECT old_value, new_value FROM audit_logs WHERE action = 'user.email_changed' AND entity_id = $1`,
      [String(userId)],
    );
    assert.equal(audit.rowCount, 1);
    assert.equal(audit.rows[0].old_value.email, oldEmail);
    assert.equal(audit.rows[0].new_value.email, newEmail);
  });
});

describe('database permission access control', () => {
  it('denies customers access to admin routes', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'asha.test@example.com', password: 'Another-pass-456' });
    const res = await request(app).get('/api/admin/hotels').set('Authorization', `Bearer ${login.body.accessToken}`);
    assert.equal(res.status, 403);
  });

  it('allows an administrator through and lets approved hotel owners in too', async () => {
    await createUserWithRole({ email: 'admin@example.com', password: PASSWORD, roleCode: 'ADMIN' });
    await createUserWithRole({ email: 'manager@example.com', password: PASSWORD, roleCode: 'HOTEL_OWNER' });

    for (const email of ['admin@example.com', 'manager@example.com']) {
      const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
      assert.ok(login.body.user.permissions.includes('console.access'));
      const res = await request(app).get('/api/admin/hotels').set('Authorization', `Bearer ${login.body.accessToken}`);
      assert.equal(res.status, 200, `${email} should reach admin routes`);
    }
  });

  it('takes a changed role-permission assignment into account on the next login', async () => {
    const email = 'permission.sales@example.com';
    await createUserWithRole({ email, password: PASSWORD, roleCode: 'SALES_EXECUTIVE' });
    const { pool } = await import('../../src/db/pool.js');

    const allowedLogin = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
    assert.ok(allowedLogin.body.user.permissions.includes('console.access'));
    assert.equal(
      (await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${allowedLogin.body.accessToken}`)).status,
      200,
    );

    try {
      await pool.query(
        `DELETE FROM role_permissions rp
          USING roles r, permissions p
          WHERE rp.role_id = r.id AND rp.permission_id = p.id
            AND r.code = 'SALES_EXECUTIVE' AND p.code = 'console.access'`,
      );

      const deniedLogin = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
      assert.equal(deniedLogin.body.user.permissions.includes('console.access'), false);
      assert.equal(
        (await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${deniedLogin.body.accessToken}`)).status,
        403,
      );
    } finally {
      await pool.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
          WHERE r.code = 'SALES_EXECUTIVE' AND p.code = 'console.access'
         ON CONFLICT DO NOTHING`,
      );
    }
  });
});
