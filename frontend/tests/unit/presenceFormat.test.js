import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presenceStatusFromHeartbeat, relativeTimeLabel, shouldSendImmediateHeartbeat } from '../../src/features/users/presenceFormat.js';

const THRESHOLDS = { onlineTimeoutMs: 90_000, awayTimeoutMs: 300_000 };
const NOW = Date.parse('2026-01-01T12:00:00Z');

test('a session with no heartbeat at all is offline', () => {
  assert.equal(presenceStatusFromHeartbeat(null, NOW, THRESHOLDS), 'offline');
  assert.equal(presenceStatusFromHeartbeat(undefined, NOW, THRESHOLDS), 'offline');
});

test('a heartbeat inside the online timeout is online', () => {
  const recent = new Date(NOW - 30_000).toISOString();
  assert.equal(presenceStatusFromHeartbeat(recent, NOW, THRESHOLDS), 'online');
});

test('a heartbeat between the online and away timeouts is away', () => {
  const stale = new Date(NOW - 120_000).toISOString();
  assert.equal(presenceStatusFromHeartbeat(stale, NOW, THRESHOLDS), 'away');
});

test('a heartbeat older than the away timeout is offline', () => {
  const veryStale = new Date(NOW - 600_000).toISOString();
  assert.equal(presenceStatusFromHeartbeat(veryStale, NOW, THRESHOLDS), 'offline');
});

test('relativeTimeLabel renders "Just now" for anything under 45 seconds, including slight clock skew', () => {
  assert.equal(relativeTimeLabel(new Date(NOW - 1_000).toISOString(), NOW), 'Just now');
  assert.equal(relativeTimeLabel(new Date(NOW + 2_000).toISOString(), NOW), 'Just now');
});

test('relativeTimeLabel renders minutes, then hours, then "Yesterday", then a plain date', () => {
  assert.equal(relativeTimeLabel(new Date(NOW - 3 * 60_000).toISOString(), NOW), '3 minutes ago');
  assert.equal(relativeTimeLabel(new Date(NOW - 2 * 3_600_000).toISOString(), NOW), '2 hours ago');
  assert.equal(relativeTimeLabel(new Date(NOW - 36 * 3_600_000).toISOString(), NOW), 'Yesterday');
  assert.match(relativeTimeLabel(new Date(NOW - 10 * 86_400_000).toISOString(), NOW), /\d{4}/);
});

test('relativeTimeLabel reports "Not available" rather than a bogus date when there is no value', () => {
  assert.equal(relativeTimeLabel(null, NOW), 'Not available');
  assert.equal(relativeTimeLabel(undefined, NOW), 'Not available');
});

test('shouldSendImmediateHeartbeat fires on the very first navigation (no prior send)', () => {
  assert.equal(shouldSendImmediateHeartbeat(NOW, 0, 30_000), true);
  assert.equal(shouldSendImmediateHeartbeat(NOW, null, 30_000), true);
});

test('shouldSendImmediateHeartbeat debounces rapid navigation within half the interval', () => {
  assert.equal(shouldSendImmediateHeartbeat(NOW, NOW - 5_000, 30_000), false);
  assert.equal(shouldSendImmediateHeartbeat(NOW, NOW - 20_000, 30_000), true);
});
