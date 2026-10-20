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
  });

  describe('P7: Server-side Pricing Source of Truth', () => {
    test('Calculates platform fee and GST accurately from settings', () => {
      const hourlyRate = 1000;
      const commissionPercent = 10;
      const gstPercent = 18;

      const platformFee = Math.round((hourlyRate * commissionPercent) / 100);
      const gstAmount = Math.round(((hourlyRate + platformFee) * gstPercent) / 100);
      const totalAmount = hourlyRate + platformFee + gstAmount;

      expect(platformFee).toBe(100);
      expect(gstAmount).toBe(198); // (1000 + 100) * 18% = 198
      expect(totalAmount).toBe(1298);
    });

    test('Zero fee session results in 0 platformFee and 0 GST', () => {
      const hourlyRate = 0;
      const commissionPercent = 10;
      const gstPercent = 18;

      const platformFee = Math.round((hourlyRate * commissionPercent) / 100);
      const gstAmount = Math.round(((hourlyRate + platformFee) * gstPercent) / 100);
      const totalAmount = hourlyRate + platformFee + gstAmount;

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
});
