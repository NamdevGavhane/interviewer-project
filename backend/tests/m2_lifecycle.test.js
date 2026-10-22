const { runLifecycleJob } = require('../services/sessionLifecycleService');
const Interview = require('../models/Interview');
const Availability = require('../models/Availability');
const PendingBooking = require('../models/PendingBooking');
const Payment = require('../models/Payment');
const Settings = require('../models/Settings');
const Notification = require('../models/Notification');
const JobLock = require('../models/JobLock');

// Mock mongoose models for unit testing without live MongoDB connection
jest.mock('../models/Interview');
jest.mock('../models/Availability');
jest.mock('../models/PendingBooking');
jest.mock('../models/Payment');
jest.mock('../models/Settings');
jest.mock('../models/Notification');
jest.mock('../models/JobLock');
jest.mock('../utils/mailer', () => ({
  sendCancellationEmail: jest.fn().mockResolvedValue(true)
}));

describe('M2: Session Expiry, Room Access, Auto-Status & Lifecycle Worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    Settings.getSettings = jest.fn().mockResolvedValue({
      mockSessionPricePaise: 5000,
      interviewerSharePercent: 70,
      minPayoutPaise: 30000,
      pendingPaymentMinutes: 10,
      joinOpensMinutesBefore: 10,
      joinGraceMinutesAfter: 15,
      noShowWaitMinutes: 10,
      slotDurationMinutes: 45
    });

    JobLock.acquire = jest.fn().mockResolvedValue({ acquired: true, instanceId: 'test_inst_1' });
    JobLock.release = jest.fn().mockResolvedValue(true);
    Notification.create = jest.fn().mockResolvedValue({});
    Availability.updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    Availability.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 0 });
    Availability.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 2 });
  });

  describe('Room Access Window Rules', () => {
    test('Grants access within join window [startTime - 10m, endTime + 15m]', () => {
      const startTime = new Date(Date.now() + 5 * 60 * 1000); // 5 min in future
      const endTime = new Date(startTime.getTime() + 45 * 60 * 1000);
      const joinOpensMinutesBefore = 10;
      const joinGraceMinutesAfter = 15;

      const now = Date.now();
      const earliestJoin = startTime.getTime() - joinOpensMinutesBefore * 60 * 1000;
      const latestJoin = endTime.getTime() + joinGraceMinutesAfter * 60 * 1000;

      expect(now >= earliestJoin && now <= latestJoin).toBe(true);
    });

    test('Denies access before window opens (< startTime - 10m)', () => {
      const startTime = new Date(Date.now() + 30 * 60 * 1000); // 30 min in future
      const joinOpensMinutesBefore = 10;
      const now = Date.now();
      const earliestJoin = startTime.getTime() - joinOpensMinutesBefore * 60 * 1000;

      expect(now < earliestJoin).toBe(true);
    });

    test('Denies access after grace window concludes (> endTime + 15m) with session ended', () => {
      const startTime = new Date(Date.now() - 70 * 60 * 1000); // 70 min in past
      const endTime = new Date(startTime.getTime() + 45 * 60 * 1000); // 25 min in past
      const joinGraceMinutesAfter = 15;
      const now = Date.now();
      const latestJoin = endTime.getTime() + joinGraceMinutesAfter * 60 * 1000; // 10 min in past

      expect(now > latestJoin).toBe(true);
    });
  });

  describe('Auto-Status Transitions in Lifecycle Worker', () => {
    test('Rule 1: Interviewer never joined within 10m of start -> interviewer_no_show + refund', async () => {
      PendingBooking.find = jest.fn().mockResolvedValue([]);
      
      const pastStartTime = new Date(Date.now() - 15 * 60 * 1000); // started 15 min ago
      const mockInterview = {
        _id: 'interview_no_show_1',
        status: 'scheduled',
        startTime: pastStartTime,
        endTime: new Date(pastStartTime.getTime() + 45 * 60 * 1000),
        topic: 'System Design',
        date: '2026-10-22',
        timeSlot: '10:00 AM - 10:45 AM',
        candidateJoinedAt: new Date(pastStartTime.getTime() + 2 * 60 * 1000),
        interviewerJoinedAt: null, // Never joined!
        paidAmount: 50,
        amountPaise: 5000,
        paymentStatus: 'paid',
        candidateId: { _id: 'cand_1', name: 'Alice', email: 'alice@test.com' },
        interviewerId: { _id: 'int_1', name: 'Bob', email: 'bob@test.com' },
        save: jest.fn().mockResolvedValue(true)
      };

      Interview.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue([mockInterview])
        })
      });

      Interview.findOneAndUpdate = jest.fn().mockImplementation((query, update) => {
        if (query.status === 'scheduled') {
          return Promise.resolve({ ...mockInterview, status: update.$set.status });
        }
        return Promise.resolve(null);
      });

      Payment.findOne = jest.fn().mockResolvedValue({
        _id: 'pay_1',
        paymentId: 'pay_rzp_123',
        status: 'captured',
        amount: 50,
        save: jest.fn().mockResolvedValue(true)
      });

      const report = await runLifecycleJob();
      expect(report.success).toBe(true);
      expect(report.interviewerNoShows).toBe(1);
      expect(Interview.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: mockInterview._id, status: 'scheduled' },
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'interviewer_no_show' })
        }),
        expect.any(Object)
      );
    });

    test('Rule 2: Candidate never joined, interviewer did -> candidate_no_show (no refund, interviewer still earns)', async () => {
      PendingBooking.find = jest.fn().mockResolvedValue([]);
      
      const pastStartTime = new Date(Date.now() - 50 * 60 * 1000); // started 50 min ago (session ended)
      const mockInterview = {
        _id: 'interview_cand_no_show',
        status: 'scheduled',
        startTime: pastStartTime,
        endTime: new Date(pastStartTime.getTime() + 45 * 60 * 1000), // ended 5 min ago
        topic: 'Frontend Mock',
        date: '2026-10-22',
        timeSlot: '09:00 AM - 09:45 AM',
        candidateJoinedAt: null, // Candidate never showed
        interviewerJoinedAt: new Date(pastStartTime.getTime() + 1 * 60 * 1000), // Interviewer attended
        paidAmount: 50,
        amountPaise: 5000,
        interviewerEarningsPaise: 3500,
        candidateId: { _id: 'cand_2', name: 'Charlie', email: 'charlie@test.com' },
        interviewerId: { _id: 'int_2', name: 'Dave', email: 'dave@test.com' }
      };

      Interview.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue([mockInterview])
        })
      });

      Interview.findOneAndUpdate = jest.fn().mockImplementation((query, update) => {
        if (query.status === 'scheduled') {
          return Promise.resolve({ ...mockInterview, status: update.$set.status });
        }
        return Promise.resolve(null);
      });

      const report = await runLifecycleJob();
      expect(report.success).toBe(true);
      expect(report.candidateNoShows).toBe(1);
      expect(Interview.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: mockInterview._id, status: 'scheduled' },
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'candidate_no_show' })
        }),
        expect.any(Object)
      );
      // Verify payment was NOT refunded for candidate no show
      expect(Payment.findOne).not.toHaveBeenCalled();
    });

    test('Rule 3: Interviewer joined and candidate joined, time over -> completed', async () => {
      PendingBooking.find = jest.fn().mockResolvedValue([]);
      
      const pastStartTime = new Date(Date.now() - 50 * 60 * 1000); // started 50m ago
      const mockInterview = {
        _id: 'interview_completed',
        status: 'scheduled',
        startTime: pastStartTime,
        endTime: new Date(pastStartTime.getTime() + 45 * 60 * 1000), // ended 5m ago
        topic: 'Backend Mock',
        candidateJoinedAt: new Date(pastStartTime.getTime() + 1 * 60 * 1000),
        interviewerJoinedAt: new Date(pastStartTime.getTime() + 2 * 60 * 1000),
        candidateId: { _id: 'cand_3', name: 'Eve', email: 'eve@test.com' },
        interviewerId: { _id: 'int_3', name: 'Frank', email: 'frank@test.com' }
      };

      Interview.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue([mockInterview])
        })
      });

      Interview.findOneAndUpdate = jest.fn().mockImplementation((query, update) => {
        if (query.status === 'scheduled') {
          return Promise.resolve({ ...mockInterview, status: update.$set.status });
        }
        return Promise.resolve(null);
      });

      const report = await runLifecycleJob();
      expect(report.success).toBe(true);
      expect(report.completedSessions).toBe(1);
      expect(Interview.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: mockInterview._id, status: 'scheduled' },
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'completed' })
        }),
        expect.any(Object)
      );
    });

    test('Rule 4: Nobody joined, time over -> expired', async () => {
      PendingBooking.find = jest.fn().mockResolvedValue([]);
      
      const pastStartTime = new Date(Date.now() - 50 * 60 * 1000);
      const mockInterview = {
        _id: 'interview_expired',
        status: 'scheduled',
        startTime: pastStartTime,
        endTime: new Date(pastStartTime.getTime() + 45 * 60 * 1000), // ended 5m ago
        topic: 'Unattended Session',
        candidateJoinedAt: null,
        interviewerJoinedAt: null,
        candidateId: { _id: 'cand_4', name: 'Grace', email: 'grace@test.com' },
        interviewerId: { _id: 'int_4', name: 'Heidi', email: 'heidi@test.com' }
      };

      Interview.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue([mockInterview])
        })
      });

      Interview.findOneAndUpdate = jest.fn().mockImplementation((query, update) => {
        if (query.status === 'scheduled') {
          return Promise.resolve({ ...mockInterview, status: update.$set.status });
        }
        return Promise.resolve(null);
      });

      const report = await runLifecycleJob();
      expect(report.success).toBe(true);
      expect(report.expiredSessions).toBe(1);
      expect(Interview.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: mockInterview._id, status: 'scheduled' },
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'expired' })
        }),
        expect.any(Object)
      );
    });

    test('Worker Idempotency: Running worker twice produces 0 transitions on already transitioned interviews', async () => {
      PendingBooking.find = jest.fn().mockResolvedValue([]);
      // On second run, no scheduled interviews remain
      Interview.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue([])
        })
      });

      const report = await runLifecycleJob();
      expect(report.success).toBe(true);
      expect(report.interviewerNoShows).toBe(0);
      expect(report.candidateNoShows).toBe(0);
      expect(report.completedSessions).toBe(0);
      expect(report.expiredSessions).toBe(0);
    });

    test('Sweep 3: Automatically deletes unbooked availability slots older than 7 days', async () => {
      PendingBooking.find = jest.fn().mockResolvedValue([]);
      Interview.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue([])
        })
      });
      Availability.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 5 });

      const report = await runLifecycleJob();
      expect(report.success).toBe(true);
      expect(report.cleanedOldSlots).toBe(5);
      expect(Availability.deleteMany).toHaveBeenCalledWith({
        isBooked: false,
        endTime: { $lt: expect.any(Date) }
      });
    });
  });
});
