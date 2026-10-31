import test from 'node:test';
import assert from 'node:assert/strict';
import { streamTicketService } from '../../src/services/streamTicket.service.js';

test('stream tickets preserve database permissions and remain single-use', () => {
  const issued = streamTicketService.issue({
    id: 42,
    roles: ['ADMIN'],
    permissions: ['console.access', 'user.manage'],
  });

  assert.deepEqual(streamTicketService.consume(issued.ticket), {
    userId: 42,
    roles: ['ADMIN'],
    permissions: ['console.access', 'user.manage'],
  });
  assert.equal(streamTicketService.consume(issued.ticket), null);
});
