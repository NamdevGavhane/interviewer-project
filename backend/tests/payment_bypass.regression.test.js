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

// Mock Razorpay
const mockOrdersCreate = jest.fn();
const mockPaymentsFetch = jest.fn();
const mockPaymentsRefund = jest.fn();

jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    orders: {
      create: mockOrdersCreate
    },
    payments: {
      fetch: mockPaymentsFetch,
      refund: mockPaymentsRefund
    }
  }));
});

const { connectTestDB, closeTestDB, clearTestDB } = require('./setup');
const { app } = require('../server');
const User = require('../models/User');
const Availability = require('../models/Availability');
const PendingBooking = require('../models/PendingBooking');
const Interview = require('../models/Interview');
const Payment = require('../models/Payment');
const Settings = require('../models/Settings');
const { generateAccessToken } = require('../middleware/auth');

describe('Payment Bypass Regression Tests (TASK A1)', () => {
  let candidateUser, candidateToken;
  let professionalUser;
  let testSlot;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    await connectTestDB();
  }, 120000);

  afterAll(async () => {
    process.env = { ...originalEnv };
    await closeTestDB();
  });

  beforeEach(async () => {
    process.env = { ...originalEnv };
    await clearTestDB();
    jest.clearAllMocks();

    await Settings.create({
      mockSessionPricePaise: 5000,
      interviewerSharePercent: 70,
      platformCommissionPercent: 10,
      gstPercent: 18,
      pendingPaymentMinutes: 10,
      currency: 'INR'
    });

    candidateUser = await User.create({
      name: 'Test Candidate',
      email: 'candidate.test@example.com',
      password: 'Password123!',
      role: 'candidate',
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: true
    });
    candidateToken = generateAccessToken(candidateUser);

    professionalUser = await User.create({
      name: 'Test Interviewer',
      email: 'interviewer.test@example.com',
      password: 'Password123!',
      role: 'professional',
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: true
    });

    const start = new Date(Date.now() + 24 * 3600 * 1000);
    const end = new Date(start.getTime() + 45 * 60 * 1000);
    testSlot = await Availability.create({
      interviewerId: professionalUser._id,
      date: start.toISOString().split('T')[0],
      slotLabel: '10:00 AM - 10:45 AM',
      startTime: start,
      endTime: end,
      timezone: 'UTC',
      isBooked: false
    });
  });

  // TEST 1
  test('1. create-order returns 503 "Payments are not configured" when Razorpay keys are missing and ALLOW_PAYMENT_SIMULATION is not true', async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.ALLOW_PAYMENT_SIMULATION;
    process.env.NODE_ENV = 'development';

    const res = await request(app)
      .post('/api/payment/create-order')
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({
        interviewerId: professionalUser._id.toString(),
        slotId: testSlot._id.toString(),
        topic: 'System Design Mock'
      });

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Payments are not configured/i);

    // Ensure slot reservation was released
    const slotDoc = await Availability.findById(testSlot._id);
    expect(slotDoc.reservedBy).toBeNull();
  });

  // TEST 2
  test('2. create-order returns 503 "Payments are not configured" in production even if ALLOW_PAYMENT_SIMULATION is true', async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    process.env.ALLOW_PAYMENT_SIMULATION = 'true';
    process.env.NODE_ENV = 'production';

    const res = await request(app)
      .post('/api/payment/create-order')
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({
        interviewerId: professionalUser._id.toString(),
        slotId: testSlot._id.toString(),
        topic: 'System Design Mock'
      });

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Payments are not configured/i);
  });

  // TEST 3
  test('3. create-order creates simulated order and stores isSimulated: true on PendingBooking when ALLOW_PAYMENT_SIMULATION is true in non-production', async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    process.env.ALLOW_PAYMENT_SIMULATION = 'true';
    process.env.NODE_ENV = 'development';

    const res = await request(app)
      .post('/api/payment/create-order')
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({
        interviewerId: professionalUser._id.toString(),
        slotId: testSlot._id.toString(),
        topic: 'Backend Architecture Mock'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isSimulated).toBe(true);
    expect(res.body.orderId).toMatch(/^order_sim_/);

    const pendingDoc = await PendingBooking.findOne({ orderId: res.body.orderId });
    expect(pendingDoc).not.toBeNull();
    expect(pendingDoc.isSimulated).toBe(true);
    expect(pendingDoc.amountPaise).toBe(5000);
  });

  // TEST 4
  test('4. verify-and-book rejects simulation bypass attempt (pay_sim_ / simulated_test_signature) when PendingBooking.isSimulated is false', async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key123';
    process.env.RAZORPAY_KEY_SECRET = 'rzp_secret_mock_long_key_12345';

    // Real order with isSimulated: false
    const pendingBooking = await PendingBooking.create({
      orderId: 'order_real_unsimulated_101',
      candidateId: candidateUser._id,
      interviewerId: professionalUser._id,
      slotId: testSlot._id,
      amountPaise: 5000,
      interviewerSharePaise: 3500,
      platformSharePaise: 1500,
      sessionFee: 50,
      amount: 50,
      currency: 'INR',
      status: 'pending',
      isSimulated: false,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    // Attacker tries to bypass by sending pay_sim_ and simulated_test_signature
    const res = await request(app)
      .post('/api/payment/verify-and-book')
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({
        interviewerId: professionalUser._id.toString(),
        slotId: testSlot._id.toString(),
        orderId: pendingBooking.orderId,
        paymentId: 'pay_sim_hack123',
        signature: 'simulated_test_signature'
      });

    // Must be rejected because isSimulated is false on PendingBooking
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);

    // PendingBooking must be reverted back to 'pending'
    const updatedPending = await PendingBooking.findById(pendingBooking._id);
    expect(updatedPending.status).toBe('pending');

    // No Interview or Payment created
    const interviewCount = await Interview.countDocuments({ orderId: pendingBooking.orderId });
    expect(interviewCount).toBe(0);
  });

  // TEST 5
  test('5. verify-and-book rejects free session bypass (FREE_ / free_session) when PendingBooking.amountPaise > 0', async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key123';
    process.env.RAZORPAY_KEY_SECRET = 'rzp_secret_mock_long_key_12345';

    const pendingBooking = await PendingBooking.create({
      orderId: 'order_paid_not_free_202',
      candidateId: candidateUser._id,
      interviewerId: professionalUser._id,
      slotId: testSlot._id,
      amountPaise: 5000,
      interviewerSharePaise: 3500,
      platformSharePaise: 1500,
      sessionFee: 50,
      amount: 50,
      currency: 'INR',
      status: 'pending',
      isSimulated: false,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    // Attacker tries to bypass by sending FREE_ orderId/paymentId and free_session signature
    const res = await request(app)
      .post('/api/payment/verify-and-book')
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({
        interviewerId: professionalUser._id.toString(),
        slotId: testSlot._id.toString(),
        orderId: pendingBooking.orderId,
        paymentId: 'FREE_hack456',
        signature: 'free_session'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);

    const updatedPending = await PendingBooking.findById(pendingBooking._id);
    expect(updatedPending.status).toBe('pending');
  });

  // TEST 6
  test('6. Real payments: verify HMAC with timingSafeEqual rejects invalid signature and resets PendingBooking to pending', async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key123';
    process.env.RAZORPAY_KEY_SECRET = 'rzp_secret_mock_long_key_12345';

    const pendingBooking = await PendingBooking.create({
      orderId: 'order_real_303',
      candidateId: candidateUser._id,
      interviewerId: professionalUser._id,
      slotId: testSlot._id,
      amountPaise: 5000,
      interviewerSharePaise: 3500,
      platformSharePaise: 1500,
      sessionFee: 50,
      amount: 50,
      currency: 'INR',
      status: 'pending',
      isSimulated: false,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    const res = await request(app)
      .post('/api/payment/verify-and-book')
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({
        interviewerId: professionalUser._id.toString(),
        slotId: testSlot._id.toString(),
        orderId: pendingBooking.orderId,
        paymentId: 'pay_real_tampered789',
        signature: 'bad_forged_signature_hex_digest_value_123456789'
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/signature verification failed/i);

    const updatedPending = await PendingBooking.findById(pendingBooking._id);
    expect(updatedPending.status).toBe('pending');
  });

  // TEST 7
  test('7. Real payments: rejects and resets PendingBooking to pending when Razorpay fetch fails or status is not captured', async () => {
    const keySecret = 'rzp_secret_mock_long_key_12345';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key123';
    process.env.RAZORPAY_KEY_SECRET = keySecret;

    const orderId = 'order_real_404';
    const paymentId = 'pay_real_uncaptured';
    const validSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const pendingBooking = await PendingBooking.create({
      orderId,
      candidateId: candidateUser._id,
      interviewerId: professionalUser._id,
      slotId: testSlot._id,
      amountPaise: 5000,
      interviewerSharePaise: 3500,
      platformSharePaise: 1500,
      sessionFee: 50,
      amount: 50,
      currency: 'INR',
      status: 'pending',
      isSimulated: false,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    // Mock Razorpay payments.fetch returning status: 'authorized' instead of 'captured'
    mockPaymentsFetch.mockResolvedValueOnce({
      id: paymentId,
      order_id: orderId,
      amount: 5000,
      currency: 'INR',
      status: 'authorized' // NOT captured!
    });

    const res = await request(app)
      .post('/api/payment/verify-and-book')
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({
        interviewerId: professionalUser._id.toString(),
        slotId: testSlot._id.toString(),
        orderId,
        paymentId,
        signature: validSignature
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not captured|mismatch/i);

    const updatedPending = await PendingBooking.findById(pendingBooking._id);
    expect(updatedPending.status).toBe('pending');
  });

  // TEST 8
  test('8. Real payment succeeds when signature and Razorpay captured payment match, or legitimate simulated/free session completes', async () => {
    const keySecret = 'rzp_secret_mock_long_key_12345';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key123';
    process.env.RAZORPAY_KEY_SECRET = keySecret;

    const orderId = 'order_real_505';
    const paymentId = 'pay_real_captured_valid';
    const validSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const pendingBooking = await PendingBooking.create({
      orderId,
      candidateId: candidateUser._id,
      interviewerId: professionalUser._id,
      slotId: testSlot._id,
      amountPaise: 5000,
      interviewerSharePaise: 3500,
      platformSharePaise: 1500,
      sessionFee: 50,
      amount: 50,
      currency: 'INR',
      status: 'pending',
      isSimulated: false,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    mockPaymentsFetch.mockResolvedValueOnce({
      id: paymentId,
      order_id: orderId,
      amount: 5000,
      currency: 'INR',
      status: 'captured'
    });

    const res = await request(app)
      .post('/api/payment/verify-and-book')
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({
        interviewerId: professionalUser._id.toString(),
        slotId: testSlot._id.toString(),
        orderId,
        paymentId,
        signature: validSignature
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const updatedPending = await PendingBooking.findById(pendingBooking._id);
    expect(updatedPending.status).toBe('completed');
    expect(updatedPending.paymentId).toBe(paymentId);

    const createdInterview = await Interview.findOne({ orderId });
    expect(createdInterview).not.toBeNull();
    expect(createdInterview.paymentStatus).toBe('paid');
    expect(createdInterview.paymentMethod).toBe('razorpay');

    const createdPayment = await Payment.findOne({ orderId });
    expect(createdPayment).not.toBeNull();
    expect(createdPayment.status).toBe('captured');
  });
});
