const request = require('supertest');
const mongoose = require('mongoose');
const { connectTestDB, closeTestDB, clearTestDB } = require('./setup');
const { app } = require('../server');
const User = require('../models/User');
const Availability = require('../models/Availability');
const Interview = require('../models/Interview');
const Batch = require('../models/Batch');
const Settings = require('../models/Settings');
const { generateAccessToken } = require('../middleware/auth');
const {
  activateBatchForCandidate,
  extendBatchForProfessionalCancellation,
  sweepExpiredBatches
} = require('../services/batchService');

describe('Time-Based Batch Validity System (Backend & Lifecycle Tests)', () => {
  let proUser, otherProUser, candidateUser, adminUser;
  let proToken, candidateToken, adminToken;

  beforeAll(async () => {
    await connectTestDB();
  }, 120000);

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();

    await Settings.deleteMany({});
    await Settings.create({
      mockSessionPricePaise: 5000,
      bookingWindowDays: 30,
      slotDurationMinutes: 45,
      slotBreakMinutes: 0,
      pendingPaymentMinutes: 10,
      refundWindowHours: 24,
      interviewerSharePercent: 70
    });

    // Professional with custom batch validity of 30 days
    proUser = await User.create({
      name: 'Dr. Jane Professional',
      email: 'jane.pro@example.com',
      password: 'Password123!',
      role: 'professional',
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: true,
      batchValidityDays: 30
    });
    proToken = generateAccessToken(proUser);

    // Another professional with 15 days batch validity
    otherProUser = await User.create({
      name: 'Alex Tech Lead',
      email: 'alex.lead@example.com',
      password: 'Password123!',
      role: 'professional',
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: true,
      batchValidityDays: 15
    });

    candidateUser = await User.create({
      name: 'John Candidate',
      email: 'john.cand@example.com',
      password: 'Password123!',
      role: 'candidate',
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: true
    });
    candidateToken = generateAccessToken(candidateUser);

    adminUser = await User.create({
      name: 'Platform Admin',
      email: 'admin@devsphere.com',
      password: 'Password123!',
      role: 'admin',
      accountStatus: 'active',
      isVerified: true
    });
    adminToken = generateAccessToken(adminUser);
  });

  // =========================================================================
  // Requirement 1: Each Professional can set their own batch validity
  // =========================================================================
  it('Requirement 1: Professional can set and update their own batch validity (e.g. 15, 30, 60 days)', async () => {
    const res = await request(app)
      .put(`/api/users/${proUser._id}`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ batchValidityDays: 60 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.batchValidityDays).toBe(60);

    const updated = await User.findById(proUser._id);
    expect(updated.batchValidityDays).toBe(60);
  });

  it('Requirement 1: Rejects invalid batch validity values (< 1 or > 365)', async () => {
    const resUnder = await request(app)
      .put(`/api/users/${proUser._id}`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ batchValidityDays: 0 });
    expect(resUnder.status).toBe(400);

    const resOver = await request(app)
      .put(`/api/users/${proUser._id}`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ batchValidityDays: 500 });
    expect(resOver.status).toBe(400);
  });

  // =========================================================================
  // Requirement 2: Activate batch upon payment and calculate expiry automatically
  // =========================================================================
  it('Requirement 2: Activates candidate batch on payment verification and calculates exact expiry date', async () => {
    const beforeActivation = Date.now();
    const batch = await activateBatchForCandidate({
      candidateId: candidateUser._id,
      interviewerId: proUser._id,
      orderId: 'order_test_req2_1',
      paymentId: 'pay_test_req2_1'
    });

    expect(batch).toBeDefined();
    expect(batch.status).toBe('active');
    expect(batch.validityDaysSnapshot).toBe(30);

    const activatedMs = new Date(batch.activatedAt).getTime();
    const expiresMs = new Date(batch.expiresAt).getTime();
    const diffDays = Math.round((expiresMs - activatedMs) / (24 * 60 * 60 * 1000));
    expect(diffDays).toBe(30);
    expect(activatedMs).toBeGreaterThanOrEqual(beforeActivation - 1000);
  });

  // =========================================================================
  // Requirement 3: Snapshot validity at purchase time is preserved
  // =========================================================================
  it('Requirement 3: Batch validity snapshot is preserved when Professional later changes validity in profile', async () => {
    // 1. Candidate purchases batch while Jane is at 30 days
    const batch = await activateBatchForCandidate({
      candidateId: candidateUser._id,
      interviewerId: proUser._id,
      orderId: 'order_snapshot_1',
      paymentId: 'pay_snapshot_1'
    });
    expect(batch.validityDaysSnapshot).toBe(30);
    const originalExpiry = new Date(batch.expiresAt).getTime();

    // 2. Jane updates profile batchValidityDays to 15 days
    await request(app)
      .put(`/api/users/${proUser._id}`)
      .set('Authorization', `Bearer ${proToken}`)
      .send({ batchValidityDays: 15 });

    // 3. Candidate's existing batch still preserves 30-day snapshot and original expiry
    const reloaded = await Batch.findById(batch._id);
    expect(reloaded.validityDaysSnapshot).toBe(30);
    expect(new Date(reloaded.expiresAt).getTime()).toBe(originalExpiry);

    // 4. A new batch purchased now receives the new 15-day snapshot
    const secondBatch = await activateBatchForCandidate({
      candidateId: candidateUser._id,
      interviewerId: proUser._id,
      orderId: 'order_snapshot_2',
      paymentId: 'pay_snapshot_2'
    });
    expect(secondBatch.validityDaysSnapshot).toBe(15);
  });

  // =========================================================================
  // Requirement 4: Auto-expire batches when validity ends; expired batches block new bookings
  // =========================================================================
  it('Requirement 4: sweepExpiredBatches marks batches past expiresAt as expired and blocks new bookings', async () => {
    // Create an expired batch (expiresAt in the past)
    const pastExpires = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    const batch = await Batch.create({
      candidateId: candidateUser._id,
      interviewerId: proUser._id,
      orderId: 'order_exp_1',
      paymentId: 'pay_exp_1',
      validityDaysSnapshot: 30,
      activatedAt: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000),
      expiresAt: pastExpires,
      status: 'active'
    });

    // Run the lifecycle sweeper
    const expiredCount = await sweepExpiredBatches();
    expect(expiredCount).toBeGreaterThanOrEqual(1);

    const updated = await Batch.findById(batch._id);
    expect(updated.status).toBe('expired');

    // Attempting to validate booking on an expired batch must fail with 400
    const res = await request(app)
      .post('/api/batches/validate-booking')
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({ interviewerId: proUser._id });

    expect(res.status).toBe(400);
    expect(res.body.canBook).toBe(false);
    expect(res.body.isExpired).toBe(true);
    expect(res.body.message).toMatch(/expired/i);
  });

  // =========================================================================
  // Requirement 5: Confirmed interviews remain valid even after batch expiry
  // =========================================================================
  it('Requirement 5: Confirmed scheduled interviews remain valid after batch expiry', async () => {
    // 1. Create interview and batch
    const slot = await Availability.create({
      interviewerId: proUser._id,
      date: '2026-11-20',
      startTime: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      endTime: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000),
      timezone: 'Asia/Kolkata',
      slotLabel: '10:00 AM - 10:45 AM',
      isBooked: true
    });

    const interview = await Interview.create({
      candidateId: candidateUser._id,
      interviewerId: proUser._id,
      date: slot.date,
      timeSlot: slot.slotLabel,
      slotId: slot._id,
      startTime: slot.startTime,
      endTime: slot.endTime,
      topic: 'System Design Mock',
      status: 'scheduled',
      price: 50,
      paidAmount: 50,
      paymentStatus: 'paid',
      meetingRoomId: 'room_batch_validity_req5'
    });

    const batch = await Batch.create({
      candidateId: candidateUser._id,
      interviewerId: proUser._id,
      interviewId: interview._id,
      validityDaysSnapshot: 15,
      activatedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Expired yesterday
      status: 'expired'
    });

    interview.batchId = batch._id;
    await interview.save();

    // 2. Candidate attempts to access room details for confirmed interview
    const res = await request(app)
      .get(`/api/interviews/${interview._id}/room-access`)
      .set('Authorization', `Bearer ${candidateToken}`);

    // Session remains scheduled and access is NOT invalidated by batch expiry
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.interview.status).toBe('scheduled');
    expect(res.body.meetingRoomId).toBe('room_batch_validity_req5');
  });

  // =========================================================================
  // Requirement 6 & 7: Professional cancellation extends batch by 7 days with history
  // =========================================================================
  it('Requirements 6 & 7: Professional cancellation extends batch expiry by 7 days and records extension history', async () => {
    const slot = await Availability.create({
      interviewerId: proUser._id,
      date: '2026-11-25',
      startTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      endTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000),
      timezone: 'Asia/Kolkata',
      slotLabel: '02:00 PM - 02:45 PM',
      isBooked: true
    });

    const interview = await Interview.create({
      candidateId: candidateUser._id,
      interviewerId: proUser._id,
      date: slot.date,
      timeSlot: slot.slotLabel,
      slotId: slot._id,
      startTime: slot.startTime,
      endTime: slot.endTime,
      topic: 'Fullstack Node.js Mock',
      status: 'scheduled',
      price: 50,
      paidAmount: 50,
      paymentStatus: 'paid'
    });

    const initialExpiry = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const batch = await Batch.create({
      candidateId: candidateUser._id,
      interviewerId: proUser._id,
      interviewId: interview._id,
      validityDaysSnapshot: 30,
      activatedAt: new Date(),
      expiresAt: initialExpiry,
      status: 'active',
      extensions: []
    });

    interview.batchId = batch._id;
    await interview.save();

    // Professional cancels the session
    const extResult = await extendBatchForProfessionalCancellation({
      interviewId: interview._id,
      reason: 'Professional urgent scheduling conflict'
    });

    expect(extResult.success).toBe(true);
    expect(extResult.extended).toBe(true);

    const reloadedBatch = await Batch.findById(batch._id);
    expect(reloadedBatch.extensions).toHaveLength(1);
    expect(reloadedBatch.extensions[0].extendedByDays).toBe(7);
    expect(String(reloadedBatch.extensions[0].interviewId)).toBe(String(interview._id));

    // Expiry must be exactly initialExpiry + 7 days
    const expectedNewExpiryMs = initialExpiry.getTime() + 7 * 24 * 60 * 60 * 1000;
    expect(new Date(reloadedBatch.expiresAt).getTime()).toBe(expectedNewExpiryMs);

    // Requirement 7: Prevent duplicate extension for the same interview cancellation
    const duplicateCall = await extendBatchForProfessionalCancellation({
      interviewId: interview._id,
      reason: 'Duplicate cancellation call'
    });

    expect(duplicateCall.extended).toBe(false);
    expect(duplicateCall.message).toMatch(/already been extended/i);

    const afterDuplicate = await Batch.findById(batch._id);
    expect(afterDuplicate.extensions).toHaveLength(1); // Still exactly 1
  });

  // =========================================================================
  // Requirement 8: Candidate cancellations do NOT grant automatic extensions
  // =========================================================================
  it('Requirement 8: Candidate cancellations do NOT grant automatic batch extension', async () => {
    const slot = await Availability.create({
      interviewerId: proUser._id,
      date: '2026-11-28',
      startTime: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
      endTime: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000),
      timezone: 'Asia/Kolkata',
      slotLabel: '04:00 PM - 04:45 PM',
      isBooked: true
    });

    const interview = await Interview.create({
      candidateId: candidateUser._id,
      interviewerId: proUser._id,
      date: slot.date,
      timeSlot: slot.slotLabel,
      slotId: slot._id,
      startTime: slot.startTime,
      endTime: slot.endTime,
      topic: 'Frontend Architecture',
      status: 'scheduled',
      price: 50,
      paidAmount: 50,
      paymentStatus: 'paid'
    });

    const initialExpiry = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const batch = await Batch.create({
      candidateId: candidateUser._id,
      interviewerId: proUser._id,
      interviewId: interview._id,
      validityDaysSnapshot: 30,
      activatedAt: new Date(),
      expiresAt: initialExpiry,
      status: 'active',
      extensions: []
    });

    interview.batchId = batch._id;
    await interview.save();

    // Candidate cancels their own interview via API
    const cancelRes = await request(app)
      .patch(`/api/interviews/${interview._id}/status`)
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({
        status: 'cancelled',
        cancelReason: 'Candidate personal conflict'
      });

    expect(cancelRes.status).toBe(200);

    const reloadedBatch = await Batch.findById(batch._id);
    expect(reloadedBatch.extensions).toHaveLength(0); // Zero extensions!
    expect(new Date(reloadedBatch.expiresAt).getTime()).toBe(initialExpiry.getTime());
  });

  // =========================================================================
  // Requirement 9 & 10: Backend validations, endpoints, and idempotency
  // =========================================================================
  it('Requirements 9 & 10: GET /api/batches/my-batches returns active batches with remaining days', async () => {
    const batch = await activateBatchForCandidate({
      candidateId: candidateUser._id,
      interviewerId: proUser._id,
      orderId: 'order_my_batches_1',
      paymentId: 'pay_my_batches_1'
    });

    const res = await request(app)
      .get('/api/batches/my-batches')
      .set('Authorization', `Bearer ${candidateToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const first = res.body.data[0];
    expect(first.validityDaysSnapshot).toBe(30);
    expect(first.daysRemaining).toBeGreaterThanOrEqual(29);
    expect(first.isExpired).toBe(false);
  });

  it('Requirement 10: Idempotent batch activation prevents duplicate batches on webhook retries', async () => {
    const orderId = 'order_webhook_retry_unique_99';

    // First attempt (e.g. from user frontend verification)
    const batch1 = await activateBatchForCandidate({
      candidateId: candidateUser._id,
      interviewerId: proUser._id,
      orderId,
      paymentId: 'pay_retry_1'
    });

    // Duplicate attempt (e.g. from delayed Razorpay webhook)
    const batch2 = await activateBatchForCandidate({
      candidateId: candidateUser._id,
      interviewerId: proUser._id,
      orderId,
      paymentId: 'pay_retry_1'
    });

    expect(String(batch1._id)).toBe(String(batch2._id));
    const allBatchesForOrder = await Batch.find({ orderId });
    expect(allBatchesForOrder).toHaveLength(1);
  });
});
