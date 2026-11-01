import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { changePasswordSchema, emailChangeRequestSchema, emailChangeVerifySchema, googleAuthSchema } from '../../src/validators/auth.validator.js';

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

  it('requires the current password and applies the normal password policy to a new password', () => {
    assert.equal(changePasswordSchema.safeParse({ currentPassword: 'Old-pass-123', newPassword: 'New-pass-456' }).success, true);
    assert.equal(changePasswordSchema.safeParse({ currentPassword: '', newPassword: 'New-pass-456' }).success, false);
    assert.equal(changePasswordSchema.safeParse({ currentPassword: 'Old-pass-123', newPassword: 'too-short' }).success, false);
    assert.equal(changePasswordSchema.safeParse({ currentPassword: 'Old-pass-123', newPassword: 'letters-only-password' }).success, false);
  });
});

