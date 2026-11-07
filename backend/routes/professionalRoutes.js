const express = require('express');
const router = express.Router();
const Availability = require('../models/Availability');
const Interview = require('../models/Interview');
const Payout = require('../models/Payout');
const Settings = require('../models/Settings');
const { authenticate } = require('../middleware/auth');

/**
 * Access control middleware: Professional access only
 */
const requireProfessionalRole = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  if (req.user.role !== 'professional') {
    return res.status(403).json({ success: false, message: 'Forbidden: Professional access only.' });
  }
  next();
};

/**
 * @route   GET /api/professional/summary
 * @desc    Get aggregated dashboard summary metrics for the authenticated professional (TASK S4)
 *          - Open slots (next N days)
 *          - Upcoming interviews
 *          - Completed this month
 *          - Earnings available
 *          - Next interview details with join window evaluation
 * @access  Protected (Professional only)
 */
router.get('/summary', authenticate, requireProfessionalRole, async (req, res) => {
  try {
    const interviewerId = req.user._id;

    // Load settings for timings and windows
    const settings = await Settings.getSettings();
    const bookingWindowDays = Number(settings.bookingWindowDays) || 30;
    const joinOpensMinutesBefore = Number(settings.joinOpensMinutesBefore) ?? 10;
    const joinGraceMinutesAfter = Number(settings.joinGraceMinutesAfter) ?? 15;
    const interviewerSharePercent = Number(settings.interviewerSharePercent) || 70;
    const payoutHoldDays = Number(settings.payoutHoldDays) || 3;
    const slotDurationMinutes = Number(settings.slotDurationMinutes) || 45;

    const now = new Date();
    const nowMs = now.getTime();
    const windowEnd = new Date(nowMs + bookingWindowDays * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const holdMs = payoutHoldDays * 24 * 60 * 60 * 1000;

    // Execute queries in parallel
    const [
      openSlotsCount,
      upcomingInterviewsCount,
      completedThisMonthCount,
      allPayouts,
      eligibleSessions,
      nextInterviewDoc
    ] = await Promise.all([
      // 1. Open slots within next N days (unbooked, future, not currently reserved)
      Availability.countDocuments({
        interviewerId,
        isBooked: false,
        startTime: { $gte: now, $lte: windowEnd },
        $or: [
          { reservedUntil: null },
          { reservedUntil: { $lte: now } }
        ]
      }),

      // 2. Upcoming interviews (scheduled or in-progress, not concluded)
      Interview.countDocuments({
        interviewerId,
        status: { $in: ['scheduled', 'in-progress'] },
        $or: [
          { endTime: { $gte: new Date(nowMs - joinGraceMinutesAfter * 60000) } },
          { endTime: null, startTime: { $gte: new Date(nowMs - 60 * 60 * 1000) } }
        ]
      }),

      // 3. Completed this month (calendar month)
      Interview.countDocuments({
        interviewerId,
        status: 'completed',
        $or: [
          { completedAt: { $gte: startOfMonth } },
          { completedAt: null, updatedAt: { $gte: startOfMonth } }
        ]
      }),

      // 4a. Payout records for available balance computation
      Payout.find({ interviewerId }),

      // 4b. Completed or candidate_no_show sessions for earnings
      Interview.find({
        interviewerId,
        status: { $in: ['completed', 'candidate_no_show'] }
      }).select('price amountPaise interviewerEarningsPaise paidAmount platformFee endTime updatedAt createdAt status'),

      // 5. Earliest upcoming scheduled/in-progress interview
      Interview.findOne({
        interviewerId,
        status: { $in: ['scheduled', 'in-progress'] },
        $or: [
          { endTime: { $gte: new Date(nowMs - joinGraceMinutesAfter * 60000) } },
          { endTime: null, startTime: { $gte: new Date(nowMs - 60 * 60 * 1000) } }
        ]
      })
        .sort({ startTime: 1, date: 1, createdAt: 1 })
        .populate('candidateId', 'name email avatar')
    ]);

    // Calculate available earnings balance matching paymentRoutes
    let eligibleEarned = 0;
    for (const session of eligibleSessions) {
      const netEarning = session.interviewerEarningsPaise
        ? session.interviewerEarningsPaise / 100
        : Math.round((Number(session.price) || 0) * (interviewerSharePercent / 100));

      const completionTime = new Date(session.endTime || session.updatedAt || session.createdAt).getTime();
      if (nowMs - completionTime >= holdMs) {
        eligibleEarned += netEarning;
      }
    }

    const paidOut = allPayouts
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + p.amount, 0);

    const pendingPayout = allPayouts
      .filter(p => p.status === 'pending' || p.status === 'processing')
      .reduce((sum, p) => sum + p.amount, 0);

    const earningsAvailable = Math.max(0, eligibleEarned - paidOut - pendingPayout);

    // Structure Next Interview details and calculate join window
    let nextInterview = null;
    if (nextInterviewDoc) {
      const start = nextInterviewDoc.startTime ? new Date(nextInterviewDoc.startTime).getTime() : null;
      const end = nextInterviewDoc.endTime
        ? new Date(nextInterviewDoc.endTime).getTime()
        : (start ? start + slotDurationMinutes * 60000 : null);

      const joinWindowStart = start ? start - joinOpensMinutesBefore * 60000 : null;
      const joinWindowEnd = end ? end + joinGraceMinutesAfter * 60000 : null;
      const isJoinable = Boolean(
        joinWindowStart && joinWindowEnd && nowMs >= joinWindowStart && nowMs <= joinWindowEnd
      );

      nextInterview = {
        id: nextInterviewDoc._id,
        candidateName: nextInterviewDoc.candidateId?.name || 'Candidate',
        candidateAvatar: nextInterviewDoc.candidateId?.avatar || null,
        candidateEmail: nextInterviewDoc.candidateId?.email || null,
        topic: nextInterviewDoc.topic || 'Mock Technical Interview',
        startTime: nextInterviewDoc.startTime,
        endTime: nextInterviewDoc.endTime,
        date: nextInterviewDoc.date,
        timeSlot: nextInterviewDoc.timeSlot,
        durationMinutes: start && end ? Math.round((end - start) / 60000) : slotDurationMinutes,
        meetingRoomId: nextInterviewDoc.meetingRoomId,
        status: nextInterviewDoc.status,
        joinWindowStart: joinWindowStart ? new Date(joinWindowStart).toISOString() : null,
        joinWindowEnd: joinWindowEnd ? new Date(joinWindowEnd).toISOString() : null,
        isJoinable
      };
    }

    res.json({
      success: true,
      data: {
        bookingWindowDays,
        openSlotsCount,
        upcomingInterviewsCount,
        completedThisMonthCount,
        earningsAvailable,
        nextInterview,
        joinConfig: {
          joinOpensMinutesBefore,
          joinGraceMinutesAfter,
          serverTime: now.toISOString()
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve professional dashboard summary: ' + err.message });
  }
});

module.exports = router;
