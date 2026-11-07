const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { DateTime, IANAZone } = require('luxon');
const mongoose = require('mongoose');

const Availability = require('../models/Availability');
const Settings = require('../models/Settings');
const Interview = require('../models/Interview');
const User = require('../models/User');
const Batch = require('../models/Batch');
const { authenticate } = require('../middleware/auth');
const { validateObjectId } = require('../middleware/validateObjectId');
const { atomicBookSlot } = require('../services/availabilityService');

/**
 * Access control middleware: Active and verified professional only (TASK S1)
 * Rejects candidates, pending/rejected applications, deactivated, or unverified accounts with 403.
 */
const requireActiveVerifiedProfessional = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  if (req.user.role !== 'professional') {
    return res.status(403).json({ success: false, message: 'Forbidden: Professional access only.' });
  }

  if (req.user.approvalStatus === 'pending' || req.user.approvalStatus === 'rejected') {
    return res.status(403).json({
      success: false,
      message: 'Access restricted: Your professional application is pending or has been rejected.',
      approvalStatus: req.user.approvalStatus
    });
  }

  if (req.user.accountStatus !== 'active' || req.user.isDeactivated || !req.user.isVerified) {
    return res.status(403).json({
      success: false,
      message: 'Access restricted: Professional account must be active and verified.'
    });
  }

  next();
};

const createSlotsSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Each date must be in YYYY-MM-DD format'))
    .min(1, 'At least 1 date is required')
    .max(31, 'Maximum 31 dates allowed'),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'startTime must be in HH:mm 24-hour format'),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'endTime must be in HH:mm 24-hour format'),
  timezone: z.string().min(1, 'timezone is required'),
  repeatWeeks: z.number().int().min(0).max(8).optional().default(0)
});

// @route   POST /api/availability/slots
// @desc    Professional creates their own slots across specified dates and window
// @access  Protected (Active + Verified Professional only)
router.post('/slots', authenticate, requireActiveVerifiedProfessional, async (req, res) => {
  try {
    const parseResult = createSlotsSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation error: ' + parseResult.error.errors.map(e => e.message).join(', '),
        errors: parseResult.error.errors
      });
    }

    const { dates, startTime, endTime, timezone, repeatWeeks } = parseResult.data;

    // Validate IANA timezone
    if (!IANAZone.isValidZone(timezone)) {
      return res.status(400).json({
        success: false,
        message: `Invalid timezone: "${timezone}". Must be a valid IANA timezone string.`
      });
    }

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const settings = await Settings.getSettings();
    const slotDurationMinutes = settings.slotDurationMinutes || 45;
    const slotBreakMinutes = settings.slotBreakMinutes ?? 0;
    const bookingWindowDays = settings.bookingWindowDays || 30;

    const now = new Date();
    const nowInZone = DateTime.now().setZone(timezone);
    const maxBookingDate = nowInZone.plus({ days: bookingWindowDays }).endOf('day');

    const windows = [];

    // Pre-validate all requested dates and repeat weeks
    for (const dateStr of dates) {
      const baseDt = DateTime.fromISO(dateStr, { zone: timezone });
      if (!baseDt.isValid) {
        return res.status(400).json({ success: false, message: `Invalid date: "${dateStr}".` });
      }

      for (let w = 0; w <= repeatWeeks; w++) {
        const currentDt = baseDt.plus({ weeks: w });
        const windowStart = currentDt.set({ hour: startH, minute: startM, second: 0, millisecond: 0 });
        const windowEnd = currentDt.set({ hour: endH, minute: endM, second: 0, millisecond: 0 });

        const windowMinutes = windowEnd.diff(windowStart, 'minutes').minutes;

        if (windowMinutes < slotDurationMinutes) {
          return res.status(400).json({
            success: false,
            message: `Window length (${windowMinutes} min) is shorter than one session (${slotDurationMinutes} min).`
          });
        }

        if (windowMinutes > 12 * 60) {
          return res.status(400).json({
            success: false,
            message: 'Window cannot be longer than 12 hours.'
          });
        }

        if (windowStart.plus({ minutes: 5 }).toJSDate() <= now) {
          return res.status(400).json({
            success: false,
            message: 'Cannot create slots in the past.'
          });
        }

        if (windowStart > maxBookingDate) {
          return res.status(400).json({
            success: false,
            message: `Cannot create slots beyond the booking window of ${bookingWindowDays} days.`
          });
        }

        windows.push({ windowStart, windowEnd });
      }
    }

    // Cut windows into sessions of slotDurationMinutes with slotBreakMinutes between them
    const generatedCandidates = [];
    for (const { windowStart, windowEnd } of windows) {
      let cursor = windowStart;
      while (cursor.plus({ minutes: slotDurationMinutes }) <= windowEnd) {
        const sessionStart = cursor;
        const sessionEnd = cursor.plus({ minutes: slotDurationMinutes });

        const slotLabel = `${sessionStart.toFormat('hh:mm a')} - ${sessionEnd.toFormat('hh:mm a')}`;

        generatedCandidates.push({
          interviewerId: req.user._id,
          date: sessionStart.toISODate(), // YYYY-MM-DD in that timezone
          slotLabel,
          startTime: sessionStart.toJSDate(), // UTC Date
          endTime: sessionEnd.toJSDate(),     // UTC Date
          timezone
        });

        cursor = sessionEnd.plus({ minutes: slotBreakMinutes });
      }
    }

    // Range overlap check: Skip (do not fail) any slot that overlaps an existing slot of the same professional
    let created = 0;
    let skippedOverlap = 0;
    const acceptedSlots = [];

    for (const candidate of generatedCandidates) {
      // Check database overlap for same professional: startTime < candidate.endTime && endTime > candidate.startTime
      const dbOverlap = await Availability.findOne({
        interviewerId: req.user._id,
        startTime: { $lt: candidate.endTime },
        endTime: { $gt: candidate.startTime }
      });

      if (dbOverlap) {
        skippedOverlap++;
        continue;
      }

      // Check batch overlap within the current request
      const batchOverlap = acceptedSlots.some(s =>
        s.startTime < candidate.endTime && s.endTime > candidate.startTime
      );

      if (batchOverlap) {
        skippedOverlap++;
        continue;
      }

      const slotDoc = await Availability.create(candidate);
      acceptedSlots.push(slotDoc);
      created++;
    }

    res.status(201).json({
      success: true,
      created,
      skippedOverlap,
      slots: acceptedSlots
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/availability/my-slots
// @desc    Get the professional's own slots with status ('open' | 'reserved' | 'booked')
// @access  Protected (Active + Verified Professional only)
router.get('/my-slots', authenticate, requireActiveVerifiedProfessional, async (req, res) => {
  try {
    const { from, to } = req.query;
    const query = { interviewerId: req.user._id };

    if (from && to) {
      query.date = { $gte: from, $lte: to };
    } else if (from) {
      query.date = { $gte: from };
    } else if (to) {
      query.date = { $lte: to };
    }

    const slots = await Availability.find(query)
      .sort({ startTime: 1 })
      .populate({
        path: 'interviewId',
        select: '_id candidateId',
        populate: { path: 'candidateId', select: 'name' }
      })
      .lean();

    const now = new Date();
    const formatted = slots.map(slot => {
      const isBooked = Boolean(slot.isBooked);
      const isReserved = !isBooked && Boolean(slot.reservedUntil && new Date(slot.reservedUntil) > now);
      const status = isBooked ? 'booked' : (isReserved ? 'reserved' : 'open');

      const interview = slot.interviewId;
      const candidateName = isBooked && interview?.candidateId?.name ? interview.candidateId.name : null;
      const interviewId = isBooked && interview?._id ? interview._id : (isBooked && slot.interviewId ? slot.interviewId : null);

      return {
        ...slot,
        status,
        candidateName,
        interviewId
      };
    });

    res.json({
      success: true,
      data: formatted
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/availability/slots
// @desc    Delete all deletable open slots for a specific date
// @access  Protected (Active + Verified Professional only)
router.delete('/slots', authenticate, requireActiveVerifiedProfessional, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: 'Valid date query parameter in YYYY-MM-DD format is required.'
      });
    }

    const now = new Date();
    // Only delete own slots that are not booked and not currently reserved
    const deleteFilter = {
      interviewerId: req.user._id,
      date,
      isBooked: false,
      $or: [
        { reservedUntil: null },
        { reservedUntil: { $lte: now } }
      ]
    };

    const result = await Availability.deleteMany(deleteFilter);
    const count = result.deletedCount || 0;

    res.json({
      success: true,
      message: `Deleted ${count} open slots for ${date}.`,
      count,
      deletedCount: count
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/availability/slots/:id
// @desc    Delete a single slot (own, not booked, not reserved)
// @access  Protected (Active + Verified Professional only)
router.delete('/slots/:id', authenticate, requireActiveVerifiedProfessional, validateObjectId('id'), async (req, res) => {
  try {
    const slot = await Availability.findById(req.params.id);
    if (!slot) {
      return res.status(404).json({ success: false, message: 'Slot not found.' });
    }

    if (slot.interviewerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You can only delete your own slots.'
      });
    }

    const now = new Date();
    const isReserved = !slot.isBooked && Boolean(slot.reservedUntil && new Date(slot.reservedUntil) > now);
    if (slot.isBooked || isReserved) {
      return res.status(409).json({
        success: false,
        message: 'Booked: cancel it from My Interviews'
      });
    }

    await Availability.findByIdAndDelete(slot._id);

    res.json({
      success: true,
      message: 'Slot deleted successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/availability/active-interviewers
// @desc    Fast aggregated query returning which interviewers have open future slots & next slot date
// @access  Protected
router.get('/active-interviewers', authenticate, async (req, res) => {
  try {
    const now = new Date();
    // 10-minute grace window for active sessions
    const graceThreshold = new Date(now.getTime() - 10 * 60 * 1000);

    const summaries = await Availability.aggregate([
      {
        $match: {
          isBooked: false,
          endTime: { $gt: now },
          startTime: { $gt: graceThreshold },
          $or: [
            { reservedUntil: null },
            { reservedUntil: { $lte: now } }
          ]
        }
      },
      {
        $sort: { startTime: 1 }
      },
      {
        $group: {
          _id: '$interviewerId',
          nextSlotDate: { $first: '$date' },
          nextSlotStart: { $first: '$startTime' },
          openCount: { $sum: 1 }
        }
      }
    ]);

    const activeMap = {};
    for (const item of summaries) {
      if (item._id) {
        activeMap[String(item._id)] = {
          hasSlots: item.openCount > 0,
          openCount: item.openCount,
          nextSlotDate: item.nextSlotDate,
          nextSlotStart: item.nextSlotStart
        };
      }
    }

    res.json({
      success: true,
      data: activeMap
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/availability/:interviewerId
// @desc    Get bookable future slots for an active, verified professional (no auto-creation)
// @access  Protected
router.get('/:interviewerId', authenticate, validateObjectId('interviewerId'), async (req, res) => {
  try {
    const { interviewerId } = req.params;
    const { from, to } = req.query;

    const interviewer = await User.findById(interviewerId);
    if (
      !interviewer ||
      interviewer.role !== 'professional' ||
      interviewer.isDeactivated ||
      interviewer.accountStatus !== 'active' ||
      !interviewer.isVerified
    ) {
      return res.status(404).json({
        success: false,
        message: 'Professional interviewer not found or not active and verified.'
      });
    }

    const now = new Date();
    const graceThreshold = new Date(now.getTime() - 10 * 60 * 1000);
    const query = {
      interviewerId,
      isBooked: false,
      endTime: { $gt: now },
      startTime: { $gt: graceThreshold },
      $or: [
        { reservedUntil: null },
        { reservedUntil: { $lte: now } }
      ]
    };

    if (from && to) {
      query.date = { $gte: from, $lte: to };
    } else if (from) {
      query.date = { $gte: from };
    } else if (to) {
      query.date = { $lte: to };
    }

    const slots = await Availability.find(query).sort({ startTime: 1 });

    res.json({
      success: true,
      data: slots
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/availability/reschedule
// @desc    Atomic Reschedule Flow: releases existing slot and books new slot
// @access  Protected
router.post('/reschedule', authenticate, async (req, res) => {
  try {
    const { interviewId, newSlotId } = req.body;

    if (!interviewId || !newSlotId) {
      return res.status(400).json({ success: false, message: 'interviewId and newSlotId are required.' });
    }

    if (!mongoose.Types.ObjectId.isValid(interviewId) || !mongoose.Types.ObjectId.isValid(newSlotId)) {
      return res.status(400).json({ success: false, message: 'Invalid interviewId or newSlotId format.' });
    }

    const interview = await Interview.findById(interviewId);
    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview session not found.' });
    }

    const isCandidate = interview.candidateId.toString() === req.user._id.toString();
    const isInterviewer = interview.interviewerId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isCandidate && !isInterviewer && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Forbidden: You cannot reschedule this interview.' });
    }

    if (interview.status === 'completed' || interview.status === 'cancelled') {
      return res.status(400).json({ success: false, message: `Cannot reschedule an interview that is already ${interview.status}.` });
    }

    // Check batch validity if interview is linked to a batch (Requirements 4 & 5)
    let linkedBatch = null;
    if (interview.batchId) {
      linkedBatch = await Batch.findById(interview.batchId);
    }
    if (!linkedBatch) {
      linkedBatch = await Batch.findOne({
        candidateId: interview.candidateId,
        interviewerId: interview.interviewerId
      }).sort({ createdAt: -1 });
    }

    if (linkedBatch) {
      const now = new Date();
      const isBatchExpired = linkedBatch.status === 'expired' || now > new Date(linkedBatch.expiresAt);
      if (isBatchExpired) {
        return res.status(400).json({
          success: false,
          message: 'Cannot reschedule: Your batch validity has expired. Expired batches cannot be used for new bookings.'
        });
      }

      const proposedSlot = await Availability.findById(newSlotId);
      if (proposedSlot && new Date(proposedSlot.startTime) > new Date(linkedBatch.expiresAt)) {
        return res.status(400).json({
          success: false,
          message: `Cannot reschedule: Selected slot falls after your batch expiry date (${new Date(linkedBatch.expiresAt).toLocaleDateString()}). Please select a slot within your batch validity.`
        });
      }
    }

    const oldSlotId = interview.slotId;

    // Atomically book the new slot
    const newSlot = await atomicBookSlot({
      interviewerId: interview.interviewerId,
      slotId: newSlotId,
      interviewId: interview._id
    });

    if (!newSlot) {
      return res.status(409).json({
        success: false,
        message: 'The selected slot is no longer available. Please select another slot.'
      });
    }

    // Safely release previous slot by explicit slotId
    if (oldSlotId && String(oldSlotId) !== String(newSlot._id)) {
      await Availability.findByIdAndUpdate(oldSlotId, {
        isBooked: false,
        interviewId: null,
        reservedBy: null,
        reservedUntil: null
      });
    }

    // Update interview record
    interview.date = newSlot.date;
    interview.timeSlot = newSlot.slotLabel;
    interview.slotId = newSlot._id;
    interview.startTime = newSlot.startTime;
    interview.endTime = newSlot.endTime;
    interview.status = 'scheduled';
    await interview.save();

    const populated = await Interview.findById(interview._id)
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email avatar title company');

    res.json({
      success: true,
      message: 'Interview successfully rescheduled!',
      data: populated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
