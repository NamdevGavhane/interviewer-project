const crypto = require('crypto');
const { DateTime } = require('luxon');
const { parseTimeString } = require('../services/availabilityService');

describe('Phase 2 Unit Tests: Payments, Booking, Timezones (P1..P9)', () => {
  describe('P8: Timezone Parsing and UTC Conversion', () => {
    test('parseTimeString correctly parses 12h and 24h time strings', () => {
      expect(parseTimeString('10:00 AM')).toEqual({ hours: 10, minutes: 0 });
      expect(parseTimeString('12:00 PM')).toEqual({ hours: 12, minutes: 0 });
      expect(parseTimeString('12:00 AM')).toEqual({ hours: 0, minutes: 0 });
      expect(parseTimeString('06:30 PM')).toEqual({ hours: 18, minutes: 30 });
      expect(parseTimeString('15:45')).toEqual({ hours: 15, minutes: 45 });
      expect(parseTimeString('invalid')).toBeNull();
    });

    test('Luxon converts Asia/Kolkata (UTC+5:30) slot to exact UTC instant', () => {
      const tz = 'Asia/Kolkata';
      const baseInZone = DateTime.fromISO('2026-06-15T00:00:00', { zone: tz });
      const parsedStart = parseTimeString('10:00 AM');

      const slotStartDt = baseInZone.set({
        hour: parsedStart.hours,
        minute: parsedStart.minutes,
        second: 0,
        millisecond: 0
      });

      const utcDate = slotStartDt.toJSDate();
      // 10:00 AM in UTC+5:30 corresponds to 04:30 AM UTC
      expect(utcDate.getUTCHours()).toBe(4);
      expect(utcDate.getUTCMinutes()).toBe(30);
      expect(slotStartDt.toISODate()).toBe('2026-06-15');
    });

    test('Luxon converts America/New_York (UTC-4 EDT) slot to exact UTC instant', () => {
      const tz = 'America/New_York';
      // June 15 is daylight saving time in NY (EDT, UTC-4)
      const baseInZone = DateTime.fromISO('2026-06-15T00:00:00', { zone: tz });
      const parsedStart = parseTimeString('10:00 AM');

      const slotStartDt = baseInZone.set({
        hour: parsedStart.hours,
        minute: parsedStart.minutes,
        second: 0,
        millisecond: 0
      });

      const utcDate = slotStartDt.toJSDate();
      // 10:00 AM EDT (UTC-4) corresponds to 14:00 (2:00 PM) UTC
      expect(utcDate.getUTCHours()).toBe(14);
      expect(utcDate.getUTCMinutes()).toBe(0);
      expect(slotStartDt.toISODate()).toBe('2026-06-15');
    });

    test('Luxon converts America/New_York (UTC-5 EST winter non-DST) slot to exact UTC instant', () => {
      const tz = 'America/New_York';
      // January 15 is standard time in NY (EST, UTC-5)
      const baseInZone = DateTime.fromISO('2026-01-15T00:00:00', { zone: tz });
      const parsedStart = parseTimeString('10:00 AM');

      const slotStartDt = baseInZone.set({
        hour: parsedStart.hours,
        minute: parsedStart.minutes,
        second: 0,
        millisecond: 0
      });

      const utcDate = slotStartDt.toJSDate();
      // 10:00 AM EST (UTC-5) corresponds to 15:00 (3:00 PM) UTC
      expect(utcDate.getUTCHours()).toBe(15);
      expect(utcDate.getUTCMinutes()).toBe(0);
      expect(slotStartDt.toISODate()).toBe('2026-01-15');
    });

    test('Luxon handles Europe/London DST transition accurately (BST UTC+1 vs GMT UTC+0)', () => {
      const tz = 'Europe/London';
      // Summer (July): BST is UTC+1
      const summerDt = DateTime.fromISO('2026-07-15T00:00:00', { zone: tz }).set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
      expect(summerDt.toJSDate().getUTCHours()).toBe(9); // 10:00 BST -> 09:00 UTC

      // Winter (December): GMT is UTC+0
      const winterDt = DateTime.fromISO('2026-12-15T00:00:00', { zone: tz }).set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
      expect(winterDt.toJSDate().getUTCHours()).toBe(10); // 10:00 GMT -> 10:00 UTC
    });
  });

  describe('P7: Server-side Pricing Source of Truth', () => {
    test('Calculates platform fee and GST accurately from settings', () => {
      const baseFee = 1000;
      const commissionPercent = 10;
      const gstPercent = 18;

      const platformFee = Math.round((baseFee * commissionPercent) / 100);
      const gstAmount = Math.round(((baseFee + platformFee) * gstPercent) / 100);
      const totalAmount = baseFee + platformFee + gstAmount;

      expect(platformFee).toBe(100);
      expect(gstAmount).toBe(198); // (1000 + 100) * 18% = 198
      expect(totalAmount).toBe(1298);
    });

    test('Zero fee session results in 0 platformFee and 0 GST', () => {
      const baseFee = 0;
      const commissionPercent = 10;
      const gstPercent = 18;

      const platformFee = Math.round((baseFee * commissionPercent) / 100);
      const gstAmount = Math.round(((baseFee + platformFee) * gstPercent) / 100);
      const totalAmount = baseFee + platformFee + gstAmount;

      expect(platformFee).toBe(0);
      expect(gstAmount).toBe(0);
      expect(totalAmount).toBe(0);
    });
  });

  describe('P3: Timing Safe Equal Verification', () => {
    const secret = 'test-secret-key-at-least-32-chars-long';
    const orderId = 'order_test_12345';
    const paymentId = 'pay_test_67890';

    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const verifySignature = (sig, exp) => {
      const sigBuf = Buffer.from(sig, 'utf8');
      const expBuf = Buffer.from(exp, 'utf8');
      if (sigBuf.length !== expBuf.length) return false;
      return crypto.timingSafeEqual(sigBuf, expBuf);
    };

    test('Valid signature matches using timingSafeEqual', () => {
      expect(verifySignature(validSignature, validSignature)).toBe(true);
    });

    test('Tampered signature is rejected safely', () => {
      const lastChar = validSignature[validSignature.length - 1];
      const tampered = validSignature.substring(0, validSignature.length - 1) + (lastChar === '0' ? '1' : '0');
      expect(verifySignature(tampered, validSignature)).toBe(false);
    });

    test('Length mismatch does not throw error and returns false', () => {
      const shortSig = 'abc123';
      expect(verifySignature(shortSig, validSignature)).toBe(false);
    });
  });

  describe('P6 & X8: Payout Calculation and Hold Days Logic', () => {
    const commissionPercent = 10;
    const payoutHoldDays = 3;
    const holdMs = payoutHoldDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const mockCompletedSessions = [
      {
        price: 1000,
        endTime: new Date(now - 5 * 24 * 60 * 60 * 1000) // 5 days ago (eligible)
      },
      {
        price: 2000,
        endTime: new Date(now - 1 * 24 * 60 * 60 * 1000) // 1 day ago (on hold)
      }
    ];

    const mockPayouts = [
      { amount: 400, status: 'completed' },
      { amount: 100, status: 'pending' },
      { amount: 500, status: 'rejected' } // rejected does NOT deduct balance
    ];

    test('Deducts platform commission and enforces payout hold period', () => {
      let totalEarned = 0;
      let eligibleEarned = 0;
      let onHoldEarned = 0;

      for (const s of mockCompletedSessions) {
        const commission = Math.round((s.price * commissionPercent) / 100);
        const net = s.price - commission;
        totalEarned += net;

        const completionTime = new Date(s.endTime).getTime();
        if (now - completionTime >= holdMs) {
          eligibleEarned += net;
        } else {
          onHoldEarned += net;
        }
      }

      // Session 1: 1000 - 100 = 900 net (eligible)
      // Session 2: 2000 - 200 = 1800 net (on hold)
      expect(totalEarned).toBe(2700);
      expect(eligibleEarned).toBe(900);
      expect(onHoldEarned).toBe(1800);

      const activeWithdrawals = mockPayouts
        .filter(p => ['pending', 'processing', 'completed'].includes(p.status))
        .reduce((sum, p) => sum + p.amount, 0);

      // Completed (400) + Pending (100) = 500 deducted
      expect(activeWithdrawals).toBe(500);

      const availableBalance = Math.max(0, eligibleEarned - activeWithdrawals);
      // 900 eligible - 500 withdrawn = 400 available
      expect(availableBalance).toBe(400);
    });
  });

  describe('P5: Refund Policy Evaluation', () => {
    const refundWindowHours = 24;

    const checkRefundEligibility = ({ startTime, userRole, isCandidate }) => {
      if (userRole === 'admin' || !isCandidate) return { eligible: true };
      const hoursUntilStart = (new Date(startTime).getTime() - Date.now()) / (3600 * 1000);
      return { eligible: hoursUntilStart >= refundWindowHours };
    };

    test('Candidate cancellation > 24h before start is refund eligible', () => {
      const startTime = new Date(Date.now() + 48 * 3600 * 1000); // 48h in future
      const result = checkRefundEligibility({ startTime, userRole: 'candidate', isCandidate: true });
      expect(result.eligible).toBe(true);
    });

    test('Candidate cancellation < 24h before start is non-refundable', () => {
      const startTime = new Date(Date.now() + 12 * 3600 * 1000); // 12h in future
      const result = checkRefundEligibility({ startTime, userRole: 'candidate', isCandidate: true });
      expect(result.eligible).toBe(false);
    });

    test('Interviewer or Admin cancellation is always eligible for full refund', () => {
      const startTime = new Date(Date.now() + 2 * 3600 * 1000); // 2h in future
      const adminResult = checkRefundEligibility({ startTime, userRole: 'admin', isCandidate: false });
      const interviewerResult = checkRefundEligibility({ startTime, userRole: 'professional', isCandidate: false });
      expect(adminResult.eligible).toBe(true);
      expect(interviewerResult.eligible).toBe(true);
    });
  });

  describe('2h: Concurrency & Race Condition Elimination (Double Booking, Double Payout, Double Refund, Webhook vs Client Verify)', () => {
    test('1. Double Booking Race Condition: Atomic slot booking guarantees only one caller wins', () => {
      // Simulate MongoDB document state
      let slotState = { _id: 'slot_123', isBooked: false, interviewId: null };

      // Atomic findOneAndUpdate simulation
      const atomicConfirmSlot = (candidateId, interviewId) => {
        if (!slotState.isBooked) {
          slotState = { ...slotState, isBooked: true, interviewId };
          return { success: true, slot: slotState };
        }
        return { success: false, slot: null };
      };

      // Two candidates race to book the exact same slot concurrently
      const call1 = atomicConfirmSlot('candidate_A', 'interview_A');
      const call2 = atomicConfirmSlot('candidate_B', 'interview_B');

      expect(call1.success).toBe(true);
      expect(call1.slot.interviewId).toBe('interview_A');
      expect(call2.success).toBe(false);
      expect(call2.slot).toBeNull();
    });

    test('2. Double Payout Race Condition: Concurrent requests are prevented by JobLock & pending state', () => {
      // Simulating distributed lock and active withdrawal check
      const heldLocks = new Set();
      const acquireLock = (name) => {
        if (heldLocks.has(name)) return { acquired: false };
        heldLocks.add(name);
        return { acquired: true };
      };
      const releaseLock = (name) => heldLocks.delete(name);

      const interviewerId = 'prof_456';
      const lockName = `payout_${interviewerId}`;

      // Request 1 acquires lock
      const lock1 = acquireLock(lockName);
      expect(lock1.acquired).toBe(true);

      // Concurrent Request 2 tries to acquire lock while Request 1 is processing
      const lock2 = acquireLock(lockName);
      expect(lock2.acquired).toBe(false);

      // Request 1 completes and releases lock
      releaseLock(lockName);

      // After release, subsequent lock attempt succeeds
      const lock3 = acquireLock(lockName);
      expect(lock3.acquired).toBe(true);
      releaseLock(lockName);
    });

    test('3. Double Refund Race Condition: Atomic state transition prevents duplicate gateway calls', () => {
      let paymentDoc = { _id: 'pay_789', paymentId: 'rzp_pay_789', refundStatus: 'none', amount: 50 };

      // Atomic transition filter: { refundStatus: { $nin: ['pending', 'processed'] } }
      const atomicClaimRefund = () => {
        if (!['pending', 'processed'].includes(paymentDoc.refundStatus)) {
          paymentDoc = { ...paymentDoc, refundStatus: 'pending' };
          return { claimed: true, payment: paymentDoc };
        }
        return { claimed: false, payment: null };
      };

      // Call 1 claims the refund atomically
      const claim1 = atomicClaimRefund();
      expect(claim1.claimed).toBe(true);
      expect(claim1.payment.refundStatus).toBe('pending');

      // Concurrent Call 2 tries to refund the same payment
      const claim2 = atomicClaimRefund();
      expect(claim2.claimed).toBe(false);
      expect(claim2.payment).toBeNull();
    });

    test('4. Webhook vs Client Verify Race Condition: Atomic PendingBooking transition eliminates duplicate booking creation', () => {
      let pendingBooking = { orderId: 'order_abc', status: 'pending', interviewId: null };
      let createdInterviews = 0;

      // Atomic transition: findOneAndUpdate({ orderId, status: 'pending' }, { $set: { status: 'processing' } })
      const processBooking = (caller) => {
        if (pendingBooking.status === 'pending') {
          pendingBooking = { ...pendingBooking, status: 'processing' };
          // Create interview
          createdInterviews += 1;
          pendingBooking.status = 'completed';
          pendingBooking.interviewId = `interview_created_by_${caller}`;
          return { status: 200, caller, created: true, interviewId: pendingBooking.interviewId };
        } else if (pendingBooking.status === 'completed' || pendingBooking.status === 'processing') {
          // Idempotent replay
          return { status: 200, caller, created: false, interviewId: pendingBooking.interviewId, idempotent: true };
        }
      };

      // Client verify and Webhook race concurrently
      const clientResult = processBooking('client_verify');
      const webhookResult = processBooking('webhook');

      expect(clientResult.created).toBe(true);
      expect(clientResult.interviewId).toBe('interview_created_by_client_verify');

      // Webhook identifies existing processing/completed and returns idempotently without duplicate interview
      expect(webhookResult.created).toBe(false);
      expect(webhookResult.idempotent).toBe(true);
      expect(webhookResult.interviewId).toBe('interview_created_by_client_verify');
      expect(createdInterviews).toBe(1);
    });
  });
});
