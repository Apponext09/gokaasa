import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { closeTestDatabase, createUserWithRole, prepareTestDatabase } from '../helpers/testDb.js';
import { mailService } from '../../src/services/mail.service.js';
import { pool } from '../../src/db/pool.js';

const PASSWORD = 'Strong-pass-123';
let app;
const sentMail = [];
const captureMail = async (message) => {
  sentMail.push(message);
  return { messageId: `test-${sentMail.length}`, accepted: [message.to], rejected: [] };
};

function codeFrom(message) {
  return message.text.match(/\d{6}/)[0];
}

function baseRegistration(overrides = {}) {
  return {
    email: 'owner@example.com',
    password: PASSWORD,
    firstName: 'Priya',
    lastName: 'Shah',
    mobile: '+919876543210',
    businessName: 'Lakeview Stays',
    businessType: 'INDIVIDUAL',
    propertyName: 'Lakeview Cottage',
    propertyCity: 'Udaipur',
    ...overrides,
  };
}

before(async () => {
  app = await prepareTestDatabase();
  mailService.send = captureMail;
});

after(closeTestDatabase);

beforeEach(() => {
  sentMail.length = 0;
});

describe('partner registration', () => {
  it('registers, normalises the email, and emails a 6-digit OTP without creating a session', async () => {
    const res = await request(app)
      .post('/api/partner/register')
      .send(baseRegistration({ email: '  Owner@Example.com ' }));

    assert.equal(res.status, 201);
    assert.equal(res.body.email, 'owner@example.com');
    assert.equal(sentMail.length, 1);
    assert.equal(sentMail[0].to, 'owner@example.com');
    assert.match(sentMail[0].text, /\d{6}/);
  });

  it('rejects invalid and missing fields with field-level details', async () => {
    const res = await request(app)
      .post('/api/partner/register')
      .send({ email: 'not-an-email', password: 'short', mobile: '123' });

    assert.equal(res.status, 422);
    const fields = res.body.error.details.map((detail) => detail.field);
    assert.ok(fields.includes('body.email'));
    assert.ok(fields.includes('body.password'));
    assert.ok(fields.includes('body.firstName'));
    assert.ok(fields.includes('body.businessName'));
    assert.ok(fields.includes('body.propertyName'));
  });

  it('blocks a second registration against a fully verified account and points to login', async () => {
    await request(app).post('/api/partner/register').send(baseRegistration({ email: 'verified-dup@example.com' }));
    const code = codeFrom(sentMail.at(-1));
    await request(app).post('/api/partner/verify-otp').send({ email: 'verified-dup@example.com', code });

    const res = await request(app).post('/api/partner/register').send(baseRegistration({ email: 'verified-dup@example.com' }));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CONFLICT');
    assert.match(res.body.error.message, /log in/i);
  });

  it('resumes an unverified pending registration instead of returning 409, and does not create a duplicate account', async () => {
    const first = await request(app).post('/api/partner/register').send(baseRegistration({ email: 'pending@example.com' }));
    assert.equal(first.status, 201);

    const second = await request(app).post('/api/partner/register').send(baseRegistration({ email: 'pending@example.com' }));
    assert.equal(second.status, 201);
    assert.equal(second.body.email, 'pending@example.com');
    assert.equal(sentMail.length, 2, 'the resume must issue (and email) a fresh code');

    const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE email = 'pending@example.com'`);
    assert.equal(rows[0].count, 1, 'resuming a pending registration must never insert a second user row');

    const code = codeFrom(sentMail.at(-1));
    const verified = await request(app).post('/api/partner/verify-otp').send({ email: 'pending@example.com', code });
    assert.equal(verified.status, 200, 'the fresh code from the resumed attempt must still work');
  });

  it('keeps the account authoritative when the OTP email fails to send, and still lets the applicant resume', async () => {
    mailService.send = async () => {
      throw new Error('SMTP connection refused');
    };
    try {
      const res = await request(app).post('/api/partner/register').send(baseRegistration({ email: 'smtp-down@example.com' }));
      assert.equal(res.status, 201, 'a mail provider failure must not undo an already-committed registration');

      const { rows } = await pool.query(`SELECT email_verified_at FROM users WHERE email = 'smtp-down@example.com'`);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].email_verified_at, null);
    } finally {
      mailService.send = captureMail;
    }

    // Once delivery works again, the applicant's natural recovery step (retrying the form) must resume,
    // not 409, and must actually deliver a working code this time.
    const retry = await request(app).post('/api/partner/register').send(baseRegistration({ email: 'smtp-down@example.com' }));
    assert.equal(retry.status, 201);
    assert.equal(sentMail.length, 1);
    const code = codeFrom(sentMail[0]);
    const verified = await request(app).post('/api/partner/verify-otp').send({ email: 'smtp-down@example.com', code });
    assert.equal(verified.status, 200);
  });

  it('rejects registration with an email already used by a non-partner account', async () => {
    await createUserWithRole({ email: 'customer@example.com', password: PASSWORD, roleCode: 'CUSTOMER' });
    const res = await request(app).post('/api/partner/register').send(baseRegistration({ email: 'customer@example.com' }));
    assert.equal(res.status, 409);
  });
});

describe('OTP verification', () => {
  it('rejects an incorrect code without consuming the real one', async () => {
    await request(app).post('/api/partner/register').send(baseRegistration({ email: 'otp-wrong@example.com' }));
    const wrong = await request(app).post('/api/partner/verify-otp').send({ email: 'otp-wrong@example.com', code: '000000' });
    assert.equal(wrong.status, 400);

    const code = codeFrom(sentMail.at(-1));
    const right = await request(app).post('/api/partner/verify-otp').send({ email: 'otp-wrong@example.com', code });
    assert.equal(right.status, 200);
  });

  it('refuses to verify again once the account is already verified', async () => {
    await request(app).post('/api/partner/register').send(baseRegistration({ email: 'otp-twice@example.com' }));
    const code = codeFrom(sentMail.at(-1));
    await request(app).post('/api/partner/verify-otp').send({ email: 'otp-twice@example.com', code });

    const again = await request(app).post('/api/partner/verify-otp').send({ email: 'otp-twice@example.com', code });
    assert.equal(again.status, 400);
  });

  it('issues a working session on verification', async () => {
    await request(app).post('/api/partner/register').send(baseRegistration({ email: 'otp-session@example.com' }));
    const code = codeFrom(sentMail.at(-1));
    const res = await request(app).post('/api/partner/verify-otp').send({ email: 'otp-session@example.com', code });

    assert.equal(res.status, 200);
    assert.ok(res.body.accessToken);
    assert.deepEqual(res.body.user.roles, ['HOTEL_OWNER']);

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, 'otp-session@example.com');
  });

  it('resend-otp never reveals whether an email exists', async () => {
    const unknown = await request(app).post('/api/partner/resend-otp').send({ email: 'nobody@example.com' });
    const known = await request(app).post('/api/partner/resend-otp').send({ email: 'otp-wrong@example.com' });
    assert.equal(unknown.status, known.status);
    assert.deepEqual(unknown.body, known.body);
  });
});

describe('property listing after approval', () => {
  async function registerVerifyAndLogin(email) {
    await request(app).post('/api/partner/register').send(baseRegistration({ email, mobile: '+919876500000' }));
    const code = codeFrom(sentMail.at(-1));
    const verified = await request(app).post('/api/partner/verify-otp').send({ email, code });
    return verified.body.accessToken;
  }

  async function approve(email) {
    const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
    await pool.query(`UPDATE partner_profiles SET status = 'APPROVED' WHERE user_id = $1`, [rows[0].id]);
  }

  it('blocks property creation until the application is approved', async () => {
    const token = await registerVerifyAndLogin('owner-unapproved@example.com');
    const res = await request(app)
      .post('/api/admin/hotels')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Too Early Inn', city: 'Jaipur', countryCode: 'IN', propertyType: 'HOTEL' });
    assert.equal(res.status, 403);
  });

  it('lets an approved partner create a property and scopes it to only that partner', async () => {
    const ownerAToken = await registerVerifyAndLogin('owner-a@example.com');
    await approve('owner-a@example.com');
    const ownerBToken = await registerVerifyAndLogin('owner-b@example.com');
    await approve('owner-b@example.com');

    const created = await request(app)
      .post('/api/admin/hotels')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ name: "Owner A's Villa", city: 'Jaipur', countryCode: 'IN', propertyType: 'HOTEL' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const hotelId = created.body.hotel.id;

    const ownRead = await request(app).get(`/api/admin/hotels/${hotelId}`).set('Authorization', `Bearer ${ownerAToken}`);
    assert.equal(ownRead.status, 200, 'the creating partner must be able to see their own property');

    const otherRead = await request(app).get(`/api/admin/hotels/${hotelId}`).set('Authorization', `Bearer ${ownerBToken}`);
    assert.equal(otherRead.status, 404, 'a different partner must not be able to see or infer this property exists');

    const otherList = await request(app).get('/api/admin/hotels').set('Authorization', `Bearer ${ownerBToken}`);
    assert.equal(otherList.status, 200);
    assert.ok(!otherList.body.items.some((item) => item.id === hotelId), "one partner's list must never include another partner's property");
  });
});
