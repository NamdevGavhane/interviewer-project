const request = require('supertest');
const crypto = require('crypto');
const mongoose = require('mongoose');

// Mock rate limiters with pass-through middleware
jest.mock('../middleware/rateLimiter', () => ({
  apiLimiter: (req, res, next) => next(),
  pollingLimiter: (req, res, next) => next(),
  authLimiter: (req, res, next) => next(),
  passwordResetLimiter: (req, res, next) => next(),
  paymentLimiter: (req, res, next) => next(),
  aiLimiter: (req, res, next) => next(),
  chatLimiter: (req, res, next) => next(),
  professionalSignupLimiter: (req, res, next) => next()
}));

// Mock mailer
jest.mock('../utils/mailer', () => ({
  isSmtpConfigured: jest.fn().mockReturnValue(true),
  sendEmail: jest.fn().mockResolvedValue({ sent: false }),
  sendBookingConfirmationEmail: jest.fn().mockResolvedValue({ sent: false }),
  sendInterviewReminderEmail: jest.fn().mockResolvedValue({ sent: false }),
  sendCancellationEmail: jest.fn().mockResolvedValue({ sent: false })
}));

const { connectTestDB, closeTestDB, clearTestDB } = require('./setup');
const { app } = require('../server');
const User = require('../models/User');
const Availability = require('../models/Availability');
const PendingBooking = require('../models/PendingBooking');
const Interview = require('../models/Interview');
const Payment = require('../models/Payment');
const Settings = require('../models/Settings');
const Counter = require('../models/Counter');
const { sweepStuckProcessingBookings, runLifecycleJob } = require('../services/sessionLifecycleService');
const { generateAccessToken } = require('../middleware/auth');

describe('TASK A7: PendingBooking Claim Try/Catch/Finally, Sweeper & Webhook Finalization', () => {
  let candidateUser, candidateToken;
  let professionalUser;
  let testSlot;
  const WEBHOOK_SECRET = 'test_webhook_secret_32_characters_long_min!';

  beforeAll(async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    await connectTestDB();
  }, 120000);

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    jest.clearAllMocks();

    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

    await Settings.create({
      mockSessionPricePaise: 5000,
      interviewerSharePercent: 70,
      platformCommissionPercent: 10,
      gstPercent: 18,
      pendingPaymentMinutes: 10,
      currency: 'INR'
    });

    candidateUser = await User.create({
      name: 'Alice Candidate',
      email: 'alice.taska7@example.com',
      password: 'Password123!',
      role: 'candidate',
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: true
    });
    candidateToken = generateAccessToken(candidateUser);

    professionalUser = await User.create({
      name: 'Bob Interviewer',
      email: 'bob.taska7@example.com',
      password: 'Password123!',
      role: 'professional',
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: true
    });

    const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 45 * 60 * 1000);
    testSlot = await Availability.create({
      interviewerId: professionalUser._id,
      date: '2026-11-05',
      startTime,
      endTime,
      slotLabel: '10:00 AM - 10:45 AM',
      isBooked: false,
      isRecurring: false
    });
  });

  describe('verify-and-book: try/catch/finally and rollback to pending on errors', () => {
    it('forces an unexpected error after claim, verifies PendingBooking is reset to pending, and retries successfully', async () => {
      const orderId = 'order_sim_test_error_retry';

      // Create PendingBooking in pending status
      await PendingBooking.create({
        orderId,
        candidateId: candidateUser._id,
        interviewerId: professionalUser._id,
        slotId: testSlot._id,
        topic: 'System Design Mock',
        notes: 'Testing error recovery',
        amountPaise: 5000,
        interviewerSharePaise: 3500,
        platformSharePaise: 1500,
        sessionFee: 50,
        platformFee: 0,
        gstAmount: 0,
        amount: 50,
        currency: 'INR',
        isSimulated: true,
        status: 'pending',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });

      // Force an unexpected error right after claim (e.g. Counter throws during invoice generation)
      const invoiceSpy = jest.spyOn(Counter, 'getNextInvoiceNumber')
        .mockRejectedValueOnce(new Error('Simulated database counter service failure'));

      // First attempt: should fail with 500
      const failedRes = await request(app)
        .post('/api/payment/verify-and-book')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({
          orderId,
          interviewerId: String(professionalUser._id),
          slotId: String(testSlot._id),
          topic: 'System Design Mock'
        });

      expect(failedRes.status).toBe(500);
      expect(failedRes.body.success).toBe(false);

      // Verify invariant: PendingBooking must NOT be stuck in 'processing', it MUST be reset to 'pending'
      const bookingAfterError = await PendingBooking.findOne({ orderId });
      expect(bookingAfterError).not.toBeNull();
      expect(bookingAfterError.status).toBe('pending');
      expect(bookingAfterError.interviewId).toBeNull();

      // Verify no interview or payment was created
      const interviewCount = await Interview.countDocuments({ orderId });
      expect(interviewCount).toBe(0);
      const paymentCount = await Payment.countDocuments({ orderId });
      expect(paymentCount).toBe(0);

      // Second attempt (retry): Counter works normally now
      const retryRes = await request(app)
        .post('/api/payment/verify-and-book')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({
          orderId,
          interviewerId: String(professionalUser._id),
          slotId: String(testSlot._id),
          topic: 'System Design Mock'
        });

      expect(retryRes.status).toBe(201);
      expect(retryRes.body.success).toBe(true);
      expect(retryRes.body.interview).toBeDefined();

      // Verify PendingBooking is now 'completed'
      const finalizedBooking = await PendingBooking.findOne({ orderId });
      expect(finalizedBooking.status).toBe('completed');
      expect(String(finalizedBooking.interviewId)).toBe(String(retryRes.body.interview._id));

      // Verify slot is booked
      const updatedSlot = await Availability.findById(testSlot._id);
      expect(updatedSlot.isBooked).toBe(true);

      invoiceSpy.mockRestore();
    });

    it('resets PendingBooking to pending when early validation fails (slot not found)', async () => {
      const orderId = 'order_sim_test_missing_slot';
      const nonExistentSlotId = new mongoose.Types.ObjectId();

      await PendingBooking.create({
        orderId,
        candidateId: candidateUser._id,
        interviewerId: professionalUser._id,
        slotId: nonExistentSlotId,
        topic: 'Early Return Test',
        amountPaise: 5000,
        interviewerSharePaise: 3500,
        platformSharePaise: 1500,
        sessionFee: 50,
        amount: 50,
        currency: 'INR',
        isSimulated: true,
        status: 'pending',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });

      const res = await request(app)
        .post('/api/payment/verify-and-book')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({
          orderId,
          interviewerId: String(professionalUser._id),
          slotId: String(nonExistentSlotId)
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);

      // Verify invariant: status must be back to 'pending'
      const booking = await PendingBooking.findOne({ orderId });
      expect(booking.status).toBe('pending');
    });

    it('never touches a PendingBooking that has already reached completed status', async () => {
      const orderId = 'order_sim_already_completed';

      const existingInterview = await Interview.create({
        candidateId: candidateUser._id,
        interviewerId: professionalUser._id,
        date: '2026-11-05',
        timeSlot: '10:00 AM - 10:45 AM',
        topic: 'Completed Session',
        price: 50,
        paidAmount: 50,
        status: 'scheduled',
        paymentStatus: 'paid',
        paymentId: 'pay_comp_123',
        orderId,
        meetingRoomId: 'room_comp_123'
      });

      await PendingBooking.create({
        orderId,
        candidateId: candidateUser._id,
        interviewerId: professionalUser._id,
        slotId: testSlot._id,
        sessionFee: 50,
        amount: 50,
        amountPaise: 5000,
        status: 'completed',
        paymentId: 'pay_comp_123',
        interviewId: existingInterview._id,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });

      const res = await request(app)
        .post('/api/payment/verify-and-book')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({
          orderId,
          interviewerId: String(professionalUser._id),
          slotId: String(testSlot._id)
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('idempotent replay');

      // Verify status remained 'completed'
      const booking = await PendingBooking.findOne({ orderId });
      expect(booking.status).toBe('completed');
    });
  });

  describe('sessionLifecycleService: sweeper for stuck processing bookings', () => {
    it('returns PendingBookings stuck in processing for > 2m to pending and leaves completed untouched', async () => {
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);

      // 1. Stuck in processing for 3 minutes (should be reset to pending)
      const stuckBooking = await PendingBooking.create({
        orderId: 'order_stuck_3m',
        candidateId: candidateUser._id,
        interviewerId: professionalUser._id,
        slotId: testSlot._id,
        sessionFee: 50,
        amount: 50,
        amountPaise: 5000,
        status: 'processing',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });
      // Force updatedAt to 3 minutes ago
      await PendingBooking.collection.updateOne(
        { _id: stuckBooking._id },
        { $set: { updatedAt: threeMinutesAgo } }
      );

      // 2. Fresh processing booking (30 seconds ago, should NOT be reset)
      const freshProcessingBooking = await PendingBooking.create({
        orderId: 'order_fresh_processing',
        candidateId: candidateUser._id,
        interviewerId: professionalUser._id,
        slotId: testSlot._id,
        sessionFee: 50,
        amount: 50,
        amountPaise: 5000,
        status: 'processing',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });
      await PendingBooking.collection.updateOne(
        { _id: freshProcessingBooking._id },
        { $set: { updatedAt: thirtySecondsAgo } }
      );

      // 3. Completed booking older than 2 minutes (MUST NEVER BE TOUCHED)
      const completedBooking = await PendingBooking.create({
        orderId: 'order_completed_old',
        candidateId: candidateUser._id,
        interviewerId: professionalUser._id,
        slotId: testSlot._id,
        sessionFee: 50,
        amount: 50,
        amountPaise: 5000,
        status: 'completed',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });
      await PendingBooking.collection.updateOne(
        { _id: completedBooking._id },
        { $set: { updatedAt: threeMinutesAgo } }
      );

      // Run sweeper directly
      const modifiedCount = await sweepStuckProcessingBookings(2 * 60 * 1000);
      expect(modifiedCount).toBe(1);

      // Assertions
      const afterStuck = await PendingBooking.findById(stuckBooking._id);
      expect(afterStuck.status).toBe('pending');

      const afterFresh = await PendingBooking.findById(freshProcessingBooking._id);
      expect(afterFresh.status).toBe('processing');

      const afterCompleted = await PendingBooking.findById(completedBooking._id);
      expect(afterCompleted.status).toBe('completed');
    });

    it('sweeps stuck processing bookings via runLifecycleJob lifecycle sweep', async () => {
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);

      const stuckBooking = await PendingBooking.create({
        orderId: 'order_stuck_lifecycle_job',
        candidateId: candidateUser._id,
        interviewerId: professionalUser._id,
        slotId: testSlot._id,
        sessionFee: 50,
        amount: 50,
        amountPaise: 5000,
        status: 'processing',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });
      await PendingBooking.collection.updateOne(
        { _id: stuckBooking._id },
        { $set: { updatedAt: threeMinutesAgo } }
      );

      const sweepResult = await runLifecycleJob({ force: true });
      expect(sweepResult.success).toBe(true);
      expect(sweepResult.stuckProcessingBookingsReset).toBeGreaterThanOrEqual(1);

      const afterSweep = await PendingBooking.findById(stuckBooking._id);
      expect(afterSweep.status).toBe('pending');
    });
  });

  describe('webhook: finalization of stuck processing and pending bookings', () => {
    it('finalizes a PendingBooking that was stuck in processing for > 2m', async () => {
      const orderId = 'order_webhook_stuck_finalize';
      const paymentId = 'pay_webhook_rzp_999';
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);

      const stuckBooking = await PendingBooking.create({
        orderId,
        candidateId: candidateUser._id,
        interviewerId: professionalUser._id,
        slotId: testSlot._id,
        topic: 'Fullstack Webhook Test',
        notes: 'Finalized via webhook test',
        amountPaise: 5000,
        interviewerSharePaise: 3500,
        platformSharePaise: 1500,
        sessionFee: 50,
        platformFee: 0,
        gstAmount: 0,
        amount: 50,
        currency: 'INR',
        status: 'processing',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });

      await PendingBooking.collection.updateOne(
        { _id: stuckBooking._id },
        { $set: { updatedAt: threeMinutesAgo } }
      );

      const webhookPayload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: orderId,
              amount: 5000,
              currency: 'INR',
              status: 'captured'
            }
          }
        }
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');

      const res = await request(app)
        .post('/api/payment/webhook')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify PendingBooking is finalized to completed
      const finalizedBooking = await PendingBooking.findOne({ orderId });
      expect(finalizedBooking.status).toBe('completed');
      expect(finalizedBooking.paymentId).toBe(paymentId);
      expect(finalizedBooking.interviewId).not.toBeNull();

      // Verify Interview is created
      const interview = await Interview.findOne({ orderId });
      expect(interview).not.toBeNull();
      expect(interview.status).toBe('scheduled');
      expect(interview.paymentStatus).toBe('paid');
      expect(interview.paymentId).toBe(paymentId);
      expect(String(interview.candidateId)).toBe(String(candidateUser._id));
      expect(String(interview.interviewerId)).toBe(String(professionalUser._id));

      // Verify Payment record is created
      const payment = await Payment.findOne({ orderId });
      expect(payment).not.toBeNull();
      expect(payment.status).toBe('captured');
      expect(payment.paymentId).toBe(paymentId);

      // Verify slot is booked
      const bookedSlot = await Availability.findById(testSlot._id);
      expect(bookedSlot.isBooked).toBe(true);

      // Calling webhook again should be idempotent
      const replayRes = await request(app)
        .post('/api/payment/webhook')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(replayRes.status).toBe(200);
      expect(replayRes.body.success).toBe(true);
    });

    it('finalizes a PendingBooking that was returned to pending by the sweeper', async () => {
      const orderId = 'order_webhook_swept_finalize';
      const paymentId = 'pay_webhook_rzp_888';

      await PendingBooking.create({
        orderId,
        candidateId: candidateUser._id,
        interviewerId: professionalUser._id,
        slotId: testSlot._id,
        topic: 'Swept Booking Finalize',
        notes: 'Finalized after sweep',
        amountPaise: 5000,
        interviewerSharePaise: 3500,
        platformSharePaise: 1500,
        sessionFee: 50,
        platformFee: 0,
        gstAmount: 0,
        amount: 50,
        currency: 'INR',
        status: 'pending',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });

      const webhookPayload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: orderId,
              amount: 5000,
              currency: 'INR',
              status: 'captured'
            }
          }
        }
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');

      const res = await request(app)
        .post('/api/payment/webhook')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const finalizedBooking = await PendingBooking.findOne({ orderId });
      expect(finalizedBooking.status).toBe('completed');
      expect(finalizedBooking.paymentId).toBe(paymentId);
      expect(finalizedBooking.interviewId).not.toBeNull();

      const interview = await Interview.findOne({ orderId });
      expect(interview).not.toBeNull();
      expect(interview.status).toBe('scheduled');
    });
  });
});
