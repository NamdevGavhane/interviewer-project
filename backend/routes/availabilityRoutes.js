const express = require('express');
const router = express.Router();
const Availability = require('../models/Availability');
const AvailabilityRule = require('../models/AvailabilityRule');
const Settings = require('../models/Settings');
const Interview = require('../models/Interview');
const User = require('../models/User');
const { authenticate, requireRole } = require('../middleware/auth');
const {
  generateSlotsForInterviewer,
  atomicBookSlot,
  releaseSlotForInterview
} = require('../services/availabilityService');

// @route   GET /api/availability/presets
// @desc    Get dynamic slot presets from Settings
// @access  Public
router.get('/presets', async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.json({
      success: true,
      data: {
        slotPresets: settings.slotPresets,
        bookingWindowDays: settings.bookingWindowDays,
        slotDurationMinutes: settings.slotDurationMinutes
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/availability/rules/my-rules
// @desc    Get recurring availability rules for current professional
// @access  Protected (Professional or Admin)
router.get('/rules/my-rules', authenticate, requireRole('professional', 'admin'), async (req, res) => {
  try {
    const interviewerId = req.query.interviewerId && req.user.role === 'admin' 
      ? req.query.interviewerId 
      : req.user._id;

    const rules = await AvailabilityRule.find({ interviewerId }).sort({ dayOfWeek: 1, startTime: 1 });
    res.json({ success: true, data: rules });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/availability/rules
// @desc    Set or update weekly recurring availability rules and generate slots
// @access  Protected (Professional or Admin)
router.post('/rules', authenticate, requireRole('professional', 'admin'), async (req, res) => {
  try {
    const interviewerId = req.body.interviewerId && req.user.role === 'admin' 
      ? req.body.interviewerId 
      : req.user._id;

    const { rules = [] } = req.body;

    // Delete existing rules for this interviewer
    await AvailabilityRule.deleteMany({ interviewerId });

    // Insert new rules
    if (rules.length > 0) {
      const formattedRules = rules.map(r => ({
        interviewerId,
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
        endTime: r.endTime,
        slotLabel: r.slotLabel || `${r.startTime} - ${r.endTime}`,
        timezone: r.timezone || 'Asia/Kolkata',
        isActive: true
      }));

      await AvailabilityRule.insertMany(formattedRules);
    }

    // Generate bookable slots for the next N days
    const generated = await generateSlotsForInterviewer(interviewerId);

    res.json({
      success: true,
      message: `Saved ${rules.length} availability rules and generated ${generated.length} upcoming slots.`,
      data: {
        rulesCount: rules.length,
        generatedSlotsCount: generated.length
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/availability/:interviewerId
// @desc    Get all bookable (unbooked) slots for an interviewer within a date window
// @access  Protected
router.get('/:interviewerId', authenticate, async (req, res) => {
  try {
    const { interviewerId } = req.params;
    const { from, to } = req.query;

    const interviewer = await User.findById(interviewerId);
    if (!interviewer || interviewer.role !== 'professional') {
      return res.status(404).json({ success: false, message: 'Professional interviewer not found.' });
    }

    // Check if slots exist; if none exist, generate them
    const existingCount = await Availability.countDocuments({
      interviewerId,
      startTime: { $gt: new Date() }
    });

    if (existingCount === 0) {
      // Check if rules exist; if not, create default rules from presets for Mon-Fri
      const ruleCount = await AvailabilityRule.countDocuments({ interviewerId });
      if (ruleCount === 0) {
        const settings = await Settings.getSettings();
        const defaultSlots = settings.slotPresets.slice(0, 4); // First 4 presets
        const defaultRules = [];

        // Weekdays: Monday(1) to Friday(5)
        for (let d = 1; d <= 5; d++) {
          for (const preset of defaultSlots) {
            const parts = preset.split('-').map(s => s.trim());
            defaultRules.push({
              interviewerId,
              dayOfWeek: d,
              startTime: parts[0] || '10:00 AM',
              endTime: parts[1] || '10:45 AM',
              slotLabel: preset,
              isActive: true
            });
          }
        }
        await AvailabilityRule.insertMany(defaultRules);
      }

      await generateSlotsForInterviewer(interviewerId);
    }

    const query = {
      interviewerId,
      isBooked: false,
      startTime: { $gt: new Date() }
    };

    if (from && to) {
      query.date = { $gte: from, $lte: to };
    } else if (from) {
      query.date = { $gte: from };
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

    // Release previous slot
    await releaseSlotForInterview(interview._id);

    // Re-associate new slot with interview
    newSlot.isBooked = true;
    newSlot.interviewId = interview._id;
    await newSlot.save();

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
      .populate('interviewerId', 'name email avatar title company hourlyRate');

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
