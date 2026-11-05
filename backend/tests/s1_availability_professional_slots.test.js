const request = require('supertest');
const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const { connectTestDB, closeTestDB, clearTestDB } = require('./setup');
const { app } = require('../server');
const User = require('../models/User');
const Availability = require('../models/Availability');
const AvailabilityRule = require('../models/AvailabilityRule');
const Interview = require('../models/Interview');
const Settings = require('../models/Settings');
const { generateAccessToken } = require('../middleware/auth');
const { runLegacySlotsCleanup } = require('../services/availabilityService');

describe('TASK S1: Professional Created Slots & Availability Overhaul', () => {
  let proUserA, proUserB, pendingPro, rejectedPro, candidateUser;
  let proTokenA, proTokenB, pendingProToken, rejectedProToken, candidateToken;

  beforeAll(async () => {
    await connectTestDB();
  }, 120000);

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();

    // Reset settings to ensure fresh state
    await Settings.deleteMany({});
    await Settings.create({
      bookingWindowDays: 30,
      slotDurationMinutes: 45,
      slotBreakMinutes: 0,
      legacySlotsCleared: false
    });

    // Approved, active, verified professional A
    proUserA = await User.create({
      name: 'Dr. Professional A',
      email: 'pro.a@example.com',
      password: 'Password123!',
      role: 'professional',
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: true
    });
    proTokenA = generateAccessToken(proUserA);

    // Approved, active, verified professional B
    proUserB = await User.create({
      name: 'Dr. Professional B',
      email: 'pro.b@example.com',
      password: 'Password123!',
      role: 'professional',
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: true
    });
    proTokenB = generateAccessToken(proUserB);

    // Pending professional
    pendingPro = await User.create({
      name: 'Pending Professional',
      email: 'pending.pro@example.com',
      password: 'Password123!',
      role: 'professional',
      accountStatus: 'active',
      approvalStatus: 'pending',
      isVerified: true
    });
    pendingProToken = generateAccessToken(pendingPro);

    // Rejected professional
    rejectedPro = await User.create({
      name: 'Rejected Professional',
      email: 'rejected.pro@example.com',
      password: 'Password123!',
      role: 'professional',
      accountStatus: 'active',
      approvalStatus: 'rejected',
      isVerified: true
    });
    rejectedProToken = generateAccessToken(rejectedPro);

    // Candidate user
    candidateUser = await User.create({
      name: 'Charlie Candidate',
      email: 'charlie.cand@example.com',
      password: 'Password123!',
      role: 'candidate',
      accountStatus: 'active',
      isVerified: true
    });
    candidateToken = generateAccessToken(candidateUser);
  });

  describe('1. Access Control & Permissions', () => {
    it('returns 403 when a candidate calls the create slots endpoint', async () => {
      const tomorrow = DateTime.now().plus({ days: 2 }).toISODate();
      const res = await request(app)
        .post('/api/availability/slots')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({
          dates: [tomorrow],
          startTime: '10:00',
          endTime: '11:30',
          timezone: 'Asia/Kolkata'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 when a pending or rejected professional calls create endpoint', async () => {
      const tomorrow = DateTime.now().plus({ days: 2 }).toISODate();

      const pendingRes = await request(app)
        .post('/api/availability/slots')
        .set('Authorization', `Bearer ${pendingProToken}`)
        .send({
          dates: [tomorrow],
          startTime: '10:00',
          endTime: '11:30',
          timezone: 'Asia/Kolkata'
        });
      expect(pendingRes.status).toBe(403);

      const rejectedRes = await request(app)
        .post('/api/availability/slots')
        .set('Authorization', `Bearer ${rejectedProToken}`)
        .send({
          dates: [tomorrow],
          startTime: '10:00',
          endTime: '11:30',
          timezone: 'Asia/Kolkata'
        });
      expect(rejectedRes.status).toBe(403);
    });
  });

  describe('2. Window Splitting with 0 and 10 Minute Breaks & Leftovers Dropped', () => {
    it('splits window with 0-minute break into exact sessions with no leftover dropped', async () => {
      const targetDate = DateTime.now().plus({ days: 3 }).toISODate();

      // Settings: 45 min duration, 0 min break. 90 min window (10:00 to 11:30) => 2 sessions
      const res = await request(app)
        .post('/api/availability/slots')
        .set('Authorization', `Bearer ${proTokenA}`)
        .send({
          dates: [targetDate],
          startTime: '10:00',
          endTime: '11:30',
          timezone: 'Asia/Kolkata'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.created).toBe(2);
      expect(res.body.skippedOverlap).toBe(0);
      expect(res.body.slots).toHaveLength(2);

      const [s1, s2] = res.body.slots;
      expect(s1.slotLabel).toBe('10:00 AM - 10:45 AM');
      expect(s2.slotLabel).toBe('10:45 AM - 11:30 AM');
    });

    it('splits window with 10-minute break and drops leftover shorter than one session', async () => {
      // Configure 10-minute break
      await Settings.updateOne({}, { $set: { slotDurationMinutes: 45, slotBreakMinutes: 10 } });

      const targetDate = DateTime.now().plus({ days: 4 }).toISODate();

      // Window: 10:00 to 12:00 (120 minutes)
      // Session 1: 10:00 - 10:45 (45m)
      // Break: 10:45 - 10:55 (10m)
      // Session 2: 10:55 - 11:40 (45m)
      // Break: 11:40 - 11:50 (10m)
      // Remaining: 11:50 to 12:00 = 10 minutes < 45m session -> leftover dropped!
      // Total created: 2 slots
      const res = await request(app)
        .post('/api/availability/slots')
        .set('Authorization', `Bearer ${proTokenA}`)
        .send({
          dates: [targetDate],
          startTime: '10:00',
          endTime: '12:00',
          timezone: 'Asia/Kolkata'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.created).toBe(2);
      expect(res.body.slots).toHaveLength(2);

      const [s1, s2] = res.body.slots;
      expect(s1.slotLabel).toBe('10:00 AM - 10:45 AM');
      expect(s2.slotLabel).toBe('10:55 AM - 11:40 AM');
    });
  });

  describe('3. Timezone Conversions & DST Day', () => {
    it('converts Asia/Kolkata (UTC+5:30) times accurately to UTC Date instances', async () => {
      const targetDate = DateTime.now().plus({ days: 5 }).toISODate();

      const res = await request(app)
        .post('/api/availability/slots')
        .set('Authorization', `Bearer ${proTokenA}`)
        .send({
          dates: [targetDate],
          startTime: '10:00',
          endTime: '10:45',
          timezone: 'Asia/Kolkata'
        });

      expect(res.status).toBe(201);
      const slot = res.body.slots[0];
      expect(slot.timezone).toBe('Asia/Kolkata');
      expect(slot.date).toBe(targetDate);

      // 10:00 AM IST on targetDate is 04:30 UTC
      const expectedUtcStart = DateTime.fromISO(targetDate, { zone: 'Asia/Kolkata' })
        .set({ hour: 10, minute: 0, second: 0, millisecond: 0 })
        .toUTC()
        .toISO();

      expect(new Date(slot.startTime).toISOString()).toBe(new Date(expectedUtcStart).toISOString());
    });

    it('converts America/New_York across a DST transition day accurately', async () => {
      // Temporarily expand bookingWindowDays for future DST day test
      await Settings.updateOne({}, { $set: { bookingWindowDays: 180 } });

      // In America/New_York, DST spring-forward is Sunday, March 14, 2027
      // 14:00 (EDT = UTC-4) converts to 18:00 UTC
      const dstDate = '2027-03-14';

      const res = await request(app)
        .post('/api/availability/slots')
        .set('Authorization', `Bearer ${proTokenA}`)
        .send({
          dates: [dstDate],
          startTime: '14:00',
          endTime: '14:45',
          timezone: 'America/New_York'
        });

      expect(res.status).toBe(201);
      const slot = res.body.slots[0];
      expect(slot.timezone).toBe('America/New_York');

      const expectedUtc = DateTime.fromISO(dstDate, { zone: 'America/New_York' })
        .set({ hour: 14, minute: 0, second: 0, millisecond: 0 })
        .toUTC()
        .toISO();

      expect(new Date(slot.startTime).toISOString()).toBe(new Date(expectedUtc).toISOString());
      expect(new Date(slot.startTime).toISOString()).toBe('2027-03-14T18:00:00.000Z');
    });
  });

  describe('4. Range Overlap Skipping & Past Time Rejection', () => {
    it('skips overlapping slots without failing the request and reports created and skippedOverlap', async () => {
      const targetDate = DateTime.now().plus({ days: 6 }).toISODate();

      // First batch: creates 10:00 - 10:45
      const res1 = await request(app)
        .post('/api/availability/slots')
        .set('Authorization', `Bearer ${proTokenA}`)
        .send({
          dates: [targetDate],
          startTime: '10:00',
          endTime: '10:45',
          timezone: 'Asia/Kolkata'
        });
      expect(res1.status).toBe(201);
      expect(res1.body.created).toBe(1);

      // Second batch: window 10:00 - 11:30 (contains 10:00-10:45 which overlaps, and 10:45-11:30 which is new)
      const res2 = await request(app)
        .post('/api/availability/slots')
        .set('Authorization', `Bearer ${proTokenA}`)
        .send({
          dates: [targetDate],
          startTime: '10:00',
          endTime: '11:30',
          timezone: 'Asia/Kolkata'
        });

      expect(res2.status).toBe(201);
      expect(res2.body.created).toBe(1); // 10:45-11:30 was created
      expect(res2.body.skippedOverlap).toBe(1); // 10:00-10:45 was skipped
      expect(res2.body.slots).toHaveLength(1);
      expect(res2.body.slots[0].slotLabel).toBe('10:45 AM - 11:30 AM');
    });

    it('rejects times in the past with 400', async () => {
      const pastDate = '2023-01-01';

      const res = await request(app)
        .post('/api/availability/slots')
        .set('Authorization', `Bearer ${proTokenA}`)
        .send({
          dates: [pastDate],
          startTime: '10:00',
          endTime: '11:30',
          timezone: 'Asia/Kolkata'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/past/i);
    });

    it('rejects windows longer than 12 hours or shorter than one session', async () => {
      const targetDate = DateTime.now().plus({ days: 7 }).toISODate();

      // Shorter than 1 session (30 mins < 45 mins)
      const shortRes = await request(app)
        .post('/api/availability/slots')
        .set('Authorization', `Bearer ${proTokenA}`)
        .send({
          dates: [targetDate],
          startTime: '10:00',
          endTime: '10:30',
          timezone: 'Asia/Kolkata'
        });
      expect(shortRes.status).toBe(400);

      // Longer than 12 hours (13 hours)
      const longRes = await request(app)
        .post('/api/availability/slots')
        .set('Authorization', `Bearer ${proTokenA}`)
        .send({
          dates: [targetDate],
          startTime: '08:00',
          endTime: '21:30',
          timezone: 'Asia/Kolkata'
        });
      expect(longRes.status).toBe(400);
    });
  });

  describe('5. Slot Deletions, Ownership & Booked Protections', () => {
    it('prevents another professional from deleting my slot (returns 403)', async () => {
      const targetDate = DateTime.now().plus({ days: 8 }).toISODate();

      const createRes = await request(app)
        .post('/api/availability/slots')
        .set('Authorization', `Bearer ${proTokenA}`)
        .send({
          dates: [targetDate],
          startTime: '10:00',
          endTime: '10:45',
          timezone: 'Asia/Kolkata'
        });
      expect(createRes.status).toBe(201);
      const slotId = createRes.body.slots[0]._id;

      // Professional B tries to delete Professional A's slot
      const deleteRes = await request(app)
        .delete(`/api/availability/slots/${slotId}`)
        .set('Authorization', `Bearer ${proTokenB}`);

      expect(deleteRes.status).toBe(403);
      expect(deleteRes.body.success).toBe(false);

      // Slot should still exist in database
      const slot = await Availability.findById(slotId);
      expect(slot).not.toBeNull();
    });

    it('prevents deletion of booked or reserved slots (returns 409 with required message)', async () => {
      const targetDate = DateTime.now().plus({ days: 9 }).toISODate();

      const createRes = await request(app)
        .post('/api/availability/slots')
        .set('Authorization', `Bearer ${proTokenA}`)
        .send({
          dates: [targetDate],
          startTime: '10:00',
          endTime: '10:45',
          timezone: 'Asia/Kolkata'
        });
      const slotId = createRes.body.slots[0]._id;

      // Mark slot as booked
      await Availability.findByIdAndUpdate(slotId, { isBooked: true });

      const bookedDeleteRes = await request(app)
        .delete(`/api/availability/slots/${slotId}`)
        .set('Authorization', `Bearer ${proTokenA}`);

      expect(bookedDeleteRes.status).toBe(409);
      expect(bookedDeleteRes.body.message).toBe('Booked: cancel it from My Interviews');

      // Mark slot as reserved in future
      await Availability.findByIdAndUpdate(slotId, {
        isBooked: false,
        reservedUntil: new Date(Date.now() + 10 * 60 * 1000)
      });

      const reservedDeleteRes = await request(app)
        .delete(`/api/availability/slots/${slotId}`)
        .set('Authorization', `Bearer ${proTokenA}`);

      expect(reservedDeleteRes.status).toBe(409);
      expect(reservedDeleteRes.body.message).toBe('Booked: cancel it from My Interviews');
    });

    it('allows owner to delete an open, unreserved slot', async () => {
      const targetDate = DateTime.now().plus({ days: 10 }).toISODate();

      const createRes = await request(app)
        .post('/api/availability/slots')
        .set('Authorization', `Bearer ${proTokenA}`)
        .send({
          dates: [targetDate],
          startTime: '10:00',
          endTime: '10:45',
          timezone: 'Asia/Kolkata'
        });
      const slotId = createRes.body.slots[0]._id;

      const deleteRes = await request(app)
        .delete(`/api/availability/slots/${slotId}`)
        .set('Authorization', `Bearer ${proTokenA}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      const slot = await Availability.findById(slotId);
      expect(slot).toBeNull();
    });

    it('deletes open slots by date with DELETE /api/availability/slots?date=YYYY-MM-DD', async () => {
      const targetDate = DateTime.now().plus({ days: 11 }).toISODate();

      await request(app)
        .post('/api/availability/slots')
        .set('Authorization', `Bearer ${proTokenA}`)
        .send({
          dates: [targetDate],
          startTime: '10:00',
          endTime: '11:30',
          timezone: 'Asia/Kolkata'
        });

      const deleteDayRes = await request(app)
        .delete(`/api/availability/slots?date=${targetDate}`)
        .set('Authorization', `Bearer ${proTokenA}`);

      expect(deleteDayRes.status).toBe(200);
      expect(deleteDayRes.body.count).toBe(2);

      const remaining = await Availability.find({ interviewerId: proUserA._id, date: targetDate });
      expect(remaining).toHaveLength(0);
    });
  });

  describe('6. GET /api/availability/:interviewerId & Empty List Without Auto-Creation', () => {
    it('returns [] when a professional has created no slots and creates nothing automatically', async () => {
      const res = await request(app)
        .get(`/api/availability/${proUserB._id}`)
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);

      // Verify that NO default slots or rules were created in DB
      const dbSlots = await Availability.countDocuments({ interviewerId: proUserB._id });
      const dbRules = await AvailabilityRule.countDocuments({ interviewerId: proUserB._id });

      expect(dbSlots).toBe(0);
      expect(dbRules).toBe(0);
    });

    it('returns only future, unbooked, and unreserved slots', async () => {
      const targetDate = DateTime.now().plus({ days: 12 }).toISODate();

      const createRes = await request(app)
        .post('/api/availability/slots')
        .set('Authorization', `Bearer ${proTokenA}`)
        .send({
          dates: [targetDate],
          startTime: '10:00',
          endTime: '12:15',
          timezone: 'Asia/Kolkata'
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.slots).toHaveLength(3);

      const [s1, s2, s3] = createRes.body.slots;

      // Mark s2 as booked
      await Availability.findByIdAndUpdate(s2._id, { isBooked: true });
      // Mark s3 as reserved in the future
      await Availability.findByIdAndUpdate(s3._id, { reservedUntil: new Date(Date.now() + 15 * 60 * 1000) });

      const res = await request(app)
        .get(`/api/availability/${proUserA._id}`)
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]._id.toString()).toBe(s1._id.toString());
    });
  });

  describe('7. GET /api/availability/my-slots', () => {
    it('returns status open, reserved, and booked with candidate name and interviewId', async () => {
      const targetDate = DateTime.now().plus({ days: 13 }).toISODate();

      const createRes = await request(app)
        .post('/api/availability/slots')
        .set('Authorization', `Bearer ${proTokenA}`)
        .send({
          dates: [targetDate],
          startTime: '10:00',
          endTime: '12:15',
          timezone: 'Asia/Kolkata'
        });
      const [s1, s2, s3] = createRes.body.slots;

      // Create an interview for s2
      const interview = await Interview.create({
        candidateId: candidateUser._id,
        interviewerId: proUserA._id,
        date: targetDate,
        timeSlot: s2.slotLabel,
        slotId: s2._id,
        topic: 'System Design Mock',
        price: 50,
        amountPaise: 5000,
        status: 'scheduled'
      });

      // s2 is booked
      await Availability.findByIdAndUpdate(s2._id, { isBooked: true, interviewId: interview._id });
      // s3 is reserved
      await Availability.findByIdAndUpdate(s3._id, { reservedUntil: new Date(Date.now() + 10 * 60 * 1000) });

      const res = await request(app)
        .get('/api/availability/my-slots')
        .set('Authorization', `Bearer ${proTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);

      const slot1 = res.body.data.find(s => s._id.toString() === s1._id.toString());
      const slot2 = res.body.data.find(s => s._id.toString() === s2._id.toString());
      const slot3 = res.body.data.find(s => s._id.toString() === s3._id.toString());

      expect(slot1.status).toBe('open');
      expect(slot1.candidateName).toBeNull();

      expect(slot2.status).toBe('booked');
      expect(slot2.candidateName).toBe('Charlie Candidate');
      expect(slot2.interviewId.toString()).toBe(interview._id.toString());

      expect(slot3.status).toBe('reserved');
      expect(slot3.candidateName).toBeNull();
    });
  });

  describe('8. One-Time Cleanup (runLegacySlotsCleanup)', () => {
    it('cleans up legacy rules and unbooked future slots once and leaves booked/reserved untouched', async () => {
      const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

      // Create legacy AvailabilityRule
      await AvailabilityRule.create({
        interviewerId: proUserA._id,
        dayOfWeek: 1,
        startTime: '10:00 AM',
        endTime: '10:45 AM',
        slotLabel: '10:00 AM - 10:45 AM'
      });

      // Create unbooked future slot
      const unbookedSlot = await Availability.create({
        interviewerId: proUserA._id,
        date: '2026-11-20',
        slotLabel: '10:00 AM - 10:45 AM',
        startTime: futureDate,
        endTime: new Date(futureDate.getTime() + 45 * 60000),
        isBooked: false
      });

      // Create booked future slot
      const bookedSlot = await Availability.create({
        interviewerId: proUserA._id,
        date: '2026-11-20',
        slotLabel: '11:00 AM - 11:45 AM',
        startTime: new Date(futureDate.getTime() + 60 * 60000),
        endTime: new Date(futureDate.getTime() + 105 * 60000),
        isBooked: true
      });

      // Create reserved future slot
      const reservedSlot = await Availability.create({
        interviewerId: proUserA._id,
        date: '2026-11-20',
        slotLabel: '12:00 PM - 12:45 PM',
        startTime: new Date(futureDate.getTime() + 120 * 60000),
        endTime: new Date(futureDate.getTime() + 165 * 60000),
        isBooked: false,
        reservedUntil: new Date(Date.now() + 10 * 60000)
      });

      // Run cleanup
      const result1 = await runLegacySlotsCleanup();
      expect(result1.success).toBe(true);
      expect(result1.deletedSlotsCount).toBe(1); // Only unbookedSlot
      expect(result1.deletedRulesCount).toBe(1);

      // Verify unbooked slot is deleted, but booked and reserved are kept
      expect(await Availability.findById(unbookedSlot._id)).toBeNull();
      expect(await Availability.findById(bookedSlot._id)).not.toBeNull();
      expect(await Availability.findById(reservedSlot._id)).not.toBeNull();
      expect(await AvailabilityRule.countDocuments({})).toBe(0);

      const settings = await Settings.findOne();
      expect(settings.legacySlotsCleared).toBe(true);

      // Run cleanup second time -> should skip because legacySlotsCleared is true
      const result2 = await runLegacySlotsCleanup();
      expect(result2.skipped).toBe(true);

      // Existing booked & reserved slots remain untouched
      expect(await Availability.findById(bookedSlot._id)).not.toBeNull();
      expect(await Availability.findById(reservedSlot._id)).not.toBeNull();
    });
  });

  describe('9. Public Configuration Endpoint (/api/config/public)', () => {
    it('returns slotDurationMinutes, slotBreakMinutes and bookingWindowDays in public config', async () => {
      await Settings.updateOne({}, {
        $set: {
          slotDurationMinutes: 45,
          slotBreakMinutes: 10,
          bookingWindowDays: 30
        }
      });

      const res = await request(app).get('/api/config/public');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.slotDurationMinutes).toBe(45);
      expect(res.body.slotBreakMinutes).toBe(10);
      expect(res.body.bookingWindowDays).toBe(30);
    });
  });
});
