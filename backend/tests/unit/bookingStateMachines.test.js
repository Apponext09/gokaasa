import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BOOKING_STATUS, canTransition } from '../../src/domain/bookingStatus.js';
import { HOLD_STATUS, canTransitionHold, isHoldLive } from '../../src/domain/holdStatus.js';
import { PAYMENT_STATUS, canTransitionPayment } from '../../src/domain/paymentStatus.js';
import { REFUND_STATUS, canTransitionRefund } from '../../src/domain/refundStatus.js';

const B = BOOKING_STATUS;

describe('booking state machine', () => {
  it('confirms only from PAID, and PAID only comes from a verified payment', () => {
    assert.equal(canTransition(B.PAYMENT_PENDING, B.CONFIRMED), false, 'a checkout must not confirm a booking directly');
    assert.equal(canTransition(B.INITIATED, B.CONFIRMED), false);
    assert.equal(canTransition(B.PAYMENT_PENDING, B.PAID), true);
    assert.equal(canTransition(B.PAID, B.CONFIRMED), true);
  });

  it('a failed payment leaves the booking open for retry; it does not move to FAILED', () => {
    assert.equal(canTransition(B.PAYMENT_PENDING, B.PAYMENT_PENDING), false, 'no self-loop is needed: the booking simply stays PAYMENT_PENDING');
  });

  it('EXPIRED and FAILED can only reach REFUND_PENDING, for a payment captured after the hold ended', () => {
    assert.deepEqual(
      [B.EXPIRED, B.FAILED].map((from) => canTransition(from, B.REFUND_PENDING)),
      [true, true],
    );
    assert.equal(canTransition(B.EXPIRED, B.CONFIRMED), false);
    assert.equal(canTransition(B.FAILED, B.CONFIRMED), false);
  });

  it('REFUNDED is terminal, and cancellation goes through REFUND_PENDING', () => {
    assert.equal(canTransition(B.REFUNDED, B.CANCELLED), false);
    assert.equal(canTransition(B.CONFIRMED, B.REFUNDED), false);
    assert.equal(canTransition(B.CANCELLED, B.REFUND_PENDING), true);
  });
});

describe('hold state machine', () => {
  it('a HELD hold ends exactly once: converted, expired or released, then nothing', () => {
    assert.deepEqual(
      [HOLD_STATUS.CONVERTED, HOLD_STATUS.EXPIRED, HOLD_STATUS.RELEASED].map((to) => canTransitionHold(HOLD_STATUS.HELD, to)),
      [true, true, true],
    );
    for (const terminal of [HOLD_STATUS.CONVERTED, HOLD_STATUS.EXPIRED, HOLD_STATUS.RELEASED]) {
      assert.deepEqual(
        [HOLD_STATUS.HELD, HOLD_STATUS.CONVERTED, HOLD_STATUS.EXPIRED, HOLD_STATUS.RELEASED].map((to) => canTransitionHold(terminal, to)),
        [false, false, false, false],
      );
    }
  });

  it('a hold past its expiry is not live, even if its status still says HELD', () => {
    const past = { status: HOLD_STATUS.HELD, expires_at: new Date(Date.now() - 1000).toISOString() };
    const future = { status: HOLD_STATUS.HELD, expires_at: new Date(Date.now() + 60_000).toISOString() };
    assert.equal(isHoldLive(past), false);
    assert.equal(isHoldLive(future), true);
    assert.equal(isHoldLive({ ...future, status: HOLD_STATUS.CONVERTED }), false);
  });
});

describe('payment and refund state machines', () => {
  it('a successful payment is never reversed except by a refund', () => {
    assert.equal(canTransitionPayment(PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.FAILED), false);
    assert.equal(canTransitionPayment(PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.REFUNDED), true);
  });

  it('a failed attempt can be superseded by a later success on the same order, but never re-pends', () => {
    assert.equal(canTransitionPayment(PAYMENT_STATUS.FAILED, PAYMENT_STATUS.SUCCESS), true, 'late capture');
    assert.equal(canTransitionPayment(PAYMENT_STATUS.FAILED, PAYMENT_STATUS.PENDING), false);
  });

  it('a refund moves PENDING to PROCESSING to SUCCESS or FAILED, and FAILED can be retried', () => {
    assert.equal(canTransitionRefund(REFUND_STATUS.PENDING, REFUND_STATUS.PROCESSING), true);
    assert.equal(canTransitionRefund(REFUND_STATUS.PROCESSING, REFUND_STATUS.SUCCESS), true);
    assert.equal(canTransitionRefund(REFUND_STATUS.FAILED, REFUND_STATUS.PROCESSING), true);
    assert.equal(canTransitionRefund(REFUND_STATUS.SUCCESS, REFUND_STATUS.PROCESSING), false, 'a completed refund is never sent again');
  });
});
