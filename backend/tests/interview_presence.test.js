const request = require('supertest');
const mongoose = require('mongoose');
const { connectTestDB, closeTestDB, clearTestDB } = require('./setup');
const { app } = require('../server');
const User = require('../models/User');
const Interview = require('../models/Interview');
const { generateAccessToken } = require('../middleware/auth');

describe('Interview Presence API (POST & GET /api/interviews/:id/presence)', () => {
  let candidateUser, professionalUser, outsiderUser;
  let candidateToken, professionalToken, outsiderToken;
  let interview;

  beforeAll(async () => {
    await connectTestDB();
  }, 120000);

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();

    candidateUser = await User.create({
      name: 'Alice Candidate',
      email: 'alice.candidate@example.com',
      password: 'Password123!',
      role: 'candidate',
      accountStatus: 'active',
      isVerified: true
    });

    professionalUser = await User.create({
      name: 'Bob Professional',
      email: 'bob.pro@example.com',
      password: 'Password123!',
      role: 'professional',
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: true
    });

    outsiderUser = await User.create({
      name: 'Eve Outsider',
      email: 'eve@example.com',
      password: 'Password123!',
      role: 'candidate',
      accountStatus: 'active',
      isVerified: true
    });

    candidateToken = generateAccessToken(candidateUser);
    professionalToken = generateAccessToken(professionalUser);
    outsiderToken = generateAccessToken(outsiderUser);

    interview = await Interview.create({
      candidateId: candidateUser._id,
      interviewerId: professionalUser._id,
      date: '2026-11-01',
      timeSlot: '10:00 AM - 10:45 AM',
      topic: 'Fullstack Engineering Mock Interview',
      price: 50,
      paymentStatus: 'paid',
      paidAmount: 50,
      meetingRoomId: 'room_presence_test_123'
    });
  });

  describe('POST /api/interviews/:id/presence', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post(`/api/interviews/${interview._id}/presence`)
        .send({ peerId: 'ip-test-candidate-123456' });
      expect(res.status).toBe(401);
    });

    it('rejects invalid ObjectId with 400', async () => {
      const res = await request(app)
        .post('/api/interviews/not-an-id/presence')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ peerId: 'ip-test-candidate-123456' });
      expect(res.status).toBe(400);
    });

    it('rejects missing or empty peerId with 400', async () => {
      const res = await request(app)
        .post(`/api/interviews/${interview._id}/presence`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ peerId: '   ' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects non-participants with 403', async () => {
      const res = await request(app)
        .post(`/api/interviews/${interview._id}/presence`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ peerId: 'ip-test-candidate-123456' });
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('records candidate presence and lastSeen timestamp', async () => {
      const candidatePeerId = 'ip-room123-candidate-abc123';
      const res = await request(app)
        .post(`/api/interviews/${interview._id}/presence`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ peerId: candidatePeerId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updated = await Interview.findById(interview._id);
      expect(updated.candidatePresence.peerId).toBe(candidatePeerId);
      expect(updated.candidatePresence.lastSeen).toBeInstanceOf(Date);
    });

    it('records interviewer presence and lastSeen timestamp', async () => {
      const proPeerId = 'ip-room123-interviewer-pro999';
      const res = await request(app)
        .post(`/api/interviews/${interview._id}/presence`)
        .set('Authorization', `Bearer ${professionalToken}`)
        .send({ peerId: proPeerId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updated = await Interview.findById(interview._id);
      expect(updated.interviewerPresence.peerId).toBe(proPeerId);
      expect(updated.interviewerPresence.lastSeen).toBeInstanceOf(Date);
    });
  });

  describe('GET /api/interviews/:id/presence', () => {
    beforeEach(async () => {
      await Interview.findByIdAndUpdate(interview._id, {
        $set: {
          'candidatePresence.peerId': 'ip-room123-candidate-can111',
          'candidatePresence.lastSeen': new Date(),
          'interviewerPresence.peerId': 'ip-room123-interviewer-int222',
          'interviewerPresence.lastSeen': new Date()
        }
      });
    });

    it('rejects non-participants with 403', async () => {
      const res = await request(app)
        .get(`/api/interviews/${interview._id}/presence`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      expect(res.status).toBe(403);
    });

    it('returns partner peerId for candidate (interviewer presence)', async () => {
      const res = await request(app)
        .get(`/api/interviews/${interview._id}/presence`)
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.peerId).toBe('ip-room123-interviewer-int222');
    });

    it('returns partner peerId for interviewer (candidate presence)', async () => {
      const res = await request(app)
        .get(`/api/interviews/${interview._id}/presence`)
        .set('Authorization', `Bearer ${professionalToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.peerId).toBe('ip-room123-candidate-can111');
    });
  });
});

