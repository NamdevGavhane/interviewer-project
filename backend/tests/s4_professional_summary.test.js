const request = require('supertest');
const mongoose = require('mongoose');
const { connectTestDB, closeTestDB, clearTestDB } = require('./setup');
const { app } = require('../server');
const User = require('../models/User');
const Availability = require('../models/Availability');
const Interview = require('../models/Interview');
const Payout = require('../models/Payout');
const Settings = require('../models/Settings');
const { generateAccessToken } = require('../middleware/auth');

describe('TASK S4: GET /api/professional/summary', () => {
  let proUser, candidateUser, otherProUser;
  let proToken, candidateToken;

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
      bookingWindowDays: 30,
      slotDurationMinutes: 45,
      slotBreakMinutes: 0,
      joinOpensMinutesBefore: 10,
      joinGraceMinutesAfter: 15,
      interviewerSharePercent: 70,
      payoutHoldDays: 3
    });

    proUser = await User.create({
      name: 'Sarah Professional',
      email: 'sarah.pro@example.com',
      password: 'Password123!',
      role: 'professional',
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: true
    });
    proToken = generateAccessToken(proUser);

    otherProUser = await User.create({
      name: 'Other Professional',
      email: 'other.pro@example.com',
      password: 'Password123!',
      role: 'professional',
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: true
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
  });

  test('1. Unauthenticated request returns 401', async () => {
    const res = await request(app).get('/api/professional/summary');
    expect(res.status).toBe(401);
  });

  test('2. Candidate token returns 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/professional/summary')
      .set('Authorization', `Bearer ${candidateToken}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('3. Professional with zero slots and zero interviews returns all zeros and nextInterview null', async () => {
    const res = await request(app)
      .get('/api/professional/summary')
      .set('Authorization', `Bearer ${proToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.openSlotsCount).toBe(0);
    expect(res.body.data.upcomingInterviewsCount).toBe(0);
    expect(res.body.data.completedThisMonthCount).toBe(0);
    expect(res.body.data.earningsAvailable).toBe(0);
    expect(res.body.data.nextInterview).toBeNull();
    expect(res.body.data.bookingWindowDays).toBe(30);
    expect(res.body.data.joinConfig).toBeDefined();
    expect(res.body.data.joinConfig.joinOpensMinutesBefore).toBe(10);
    expect(res.body.data.joinConfig.joinGraceMinutesAfter).toBe(15);
  });

  test('4. Correctly aggregates open slots, skipping booked, past, and currently reserved slots', async () => {
    const now = new Date();

    // Valid open future slot (tomorrow)
    await Availability.create({
      interviewerId: proUser._id,
      date: '2026-11-10',
      slotLabel: '10:00 AM - 10:45 AM',
      startTime: new Date(now.getTime() + 24 * 3600000),
      endTime: new Date(now.getTime() + 24 * 3600000 + 45 * 60000),
      isBooked: false,
      timezone: 'UTC'
    });

    // Valid second open future slot (day after tomorrow)
    await Availability.create({
      interviewerId: proUser._id,
      date: '2026-11-11',
      slotLabel: '11:00 AM - 11:45 AM',
      startTime: new Date(now.getTime() + 48 * 3600000),
      endTime: new Date(now.getTime() + 48 * 3600000 + 45 * 60000),
      isBooked: false,
      timezone: 'UTC'
    });

    // Booked slot (should not count in openSlotsCount)
    await Availability.create({
      interviewerId: proUser._id,
      date: '2026-11-12',
      slotLabel: '02:00 PM - 02:45 PM',
      startTime: new Date(now.getTime() + 72 * 3600000),
      endTime: new Date(now.getTime() + 72 * 3600000 + 45 * 60000),
      isBooked: true,
      timezone: 'UTC'
    });

    // Past slot (should not count)
    await Availability.create({
      interviewerId: proUser._id,
      date: '2026-11-01',
      slotLabel: '09:00 AM - 09:45 AM',
      startTime: new Date(now.getTime() - 48 * 3600000),
      endTime: new Date(now.getTime() - 48 * 3600000 + 45 * 60000),
      isBooked: false,
      timezone: 'UTC'
    });

    // Currently reserved slot (reservedUntil in future -> should not count)
    await Availability.create({
      interviewerId: proUser._id,
      date: '2026-11-13',
      slotLabel: '04:00 PM - 04:45 PM',
      startTime: new Date(now.getTime() + 96 * 3600000),
      endTime: new Date(now.getTime() + 96 * 3600000 + 45 * 60000),
      isBooked: false,
      isReserved: true,
      reservedUntil: new Date(now.getTime() + 10 * 60000),
      timezone: 'UTC'
    });

    // Another professional's slot (should not count)
    await Availability.create({
      interviewerId: otherProUser._id,
      date: '2026-11-10',
      slotLabel: '10:00 AM - 10:45 AM',
      startTime: new Date(now.getTime() + 24 * 3600000),
      endTime: new Date(now.getTime() + 24 * 3600000 + 45 * 60000),
      isBooked: false,
      timezone: 'UTC'
    });

    const res = await request(app)
      .get('/api/professional/summary')
      .set('Authorization', `Bearer ${proToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.openSlotsCount).toBe(2);
  });

  test('5. Accurately calculates upcoming interviews, completed this month, earnings available, and next interview', async () => {
    const now = new Date();
    const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 3600000);

    // 1. Completed interview eligible for payout (completed 4 days ago > 3 days hold)
    await Interview.create({
      interviewerId: proUser._id,
      candidateId: candidateUser._id,
      date: '2026-11-02',
      timeSlot: '10:00 AM - 10:45 AM',
      topic: 'React & System Design',
      price: 50,
      interviewerEarningsPaise: 3500, // Rs 35
      status: 'completed',
      completedAt: fourDaysAgo,
      startTime: fourDaysAgo,
      endTime: new Date(fourDaysAgo.getTime() + 45 * 60000),
      paymentStatus: 'paid'
    });

    // 2. Upcoming interview tomorrow
    const tomorrowStart = new Date(now.getTime() + 24 * 3600000);
    const tomorrowEnd = new Date(tomorrowStart.getTime() + 45 * 60000);
    await Interview.create({
      interviewerId: proUser._id,
      candidateId: candidateUser._id,
      date: '2026-11-07',
      timeSlot: '02:00 PM - 02:45 PM',
      topic: 'Fullstack Node.js Architecture',
      price: 50,
      interviewerEarningsPaise: 3500,
      status: 'scheduled',
      startTime: tomorrowStart,
      endTime: tomorrowEnd,
      paymentStatus: 'paid',
      meetingRoomId: 'room_sarah_123'
    });

    const res = await request(app)
      .get('/api/professional/summary')
      .set('Authorization', `Bearer ${proToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.upcomingInterviewsCount).toBe(1);
    expect(res.body.data.completedThisMonthCount).toBe(1);
    expect(res.body.data.earningsAvailable).toBe(35); // 3500 paise / 100

    expect(res.body.data.nextInterview).not.toBeNull();
    expect(res.body.data.nextInterview.candidateName).toBe('John Candidate');
    expect(res.body.data.nextInterview.topic).toBe('Fullstack Node.js Architecture');
    expect(res.body.data.nextInterview.isJoinable).toBe(false); // tomorrow, outside window
  });

  test('6. nextInterview inside join window has isJoinable = true', async () => {
    const now = new Date();
    // Interview starting in 5 minutes (inside the 10m window before start)
    const startingSoon = new Date(now.getTime() + 5 * 60000);
    const endingSoon = new Date(startingSoon.getTime() + 45 * 60000);

    await Interview.create({
      interviewerId: proUser._id,
      candidateId: candidateUser._id,
      date: '2026-11-06',
      timeSlot: '05:00 PM - 05:45 PM',
      topic: 'Live Coding Interview',
      price: 50,
      interviewerEarningsPaise: 3500,
      status: 'scheduled',
      startTime: startingSoon,
      endTime: endingSoon,
      paymentStatus: 'paid',
      meetingRoomId: 'room_live_now'
    });

    const res = await request(app)
      .get('/api/professional/summary')
      .set('Authorization', `Bearer ${proToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.nextInterview).not.toBeNull();
    expect(res.body.data.nextInterview.isJoinable).toBe(true);
    expect(res.body.data.nextInterview.meetingRoomId).toBe('room_live_now');
  });
});
