import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { emailChangeRequestSchema, emailChangeVerifySchema, googleAuthSchema } from '../../src/validators/auth.validator.js';

describe('staff email change validation', () => {
  it('normalises the requested email and accepts a six-digit code', () => {
    const request = emailChangeRequestSchema.parse({
      newEmail: '  ADMIN@Company.Example ',
      currentPassword: 'current-password',
    });
    assert.equal(request.newEmail, 'admin@company.example');
    assert.equal(emailChangeVerifySchema.parse({ code: ' 123456 ' }).code, '123456');
  });

  it('rejects invalid emails, empty passwords and non-six-digit codes', () => {
    assert.equal(emailChangeRequestSchema.safeParse({ newEmail: 'bad', currentPassword: '' }).success, false);
    assert.equal(emailChangeVerifySchema.safeParse({ code: '12345' }).success, false);
    assert.equal(emailChangeVerifySchema.safeParse({ code: '12345a' }).success, false);
  });

  it('accepts valid google credential or access token and rejects empty payloads', () => {
    assert.equal(googleAuthSchema.safeParse({ credential: 'valid-google-id-token-xyz' }).success, true);
    assert.equal(googleAuthSchema.safeParse({ accessToken: 'valid-google-access-token-abc' }).success, true);
    assert.equal(googleAuthSchema.safeParse({}).success, false);
    assert.equal(googleAuthSchema.safeParse({ credential: 'short' }).success, false);
  });
});

