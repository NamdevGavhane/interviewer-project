const express = require('express');
const router = express.Router();
const Interview = require('../models/Interview');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { releaseSlotForInterview, atomicBookSlot } = require('../services/availabilityService');
const { authenticate, requireRole, requireActiveProfessional } = require('../middleware/auth');

// Apply authentication to ALL interview routes
router.use(authenticate);

// @route   POST /api/interviews
// @desc    Book a new interview (Candidate or Admin)
// @access  Protected
router.post('/', async (req, res) => {
  try {
    const { interviewerId, date, timeSlot, topic, notes } = req.body;

    // Never trust candidateId from body; always enforce req.user._id
    const candidateId = req.user.role === 'admin' && req.body.candidateId 
      ? req.body.candidateId 
      : req.user._id;

    if (!interviewerId || !date || !timeSlot) {
      return res.status(400).json({ success: false, message: 'Missing required booking fields (interviewerId, date, timeSlot).' });
    }

    // Ensure interviewer is an active, verified professional
    const interviewer = await User.findById(interviewerId);
    if (!interviewer || interviewer.role !== 'professional' || interviewer.isDeactivated || interviewer.accountStatus !== 'active' || !interviewer.isVerified) {
      return res.status(400).json({ success: false, message: 'Selected interviewer is not an active verified professional.' });
    }

    // Check if slot is already booked
    const existing = await Interview.findOne({
      interviewerId,
      date,
      timeSlot,
      status: 'scheduled'
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'This time slot has already been booked with this interviewer. Please choose another slot.'
      });
    }

    const price = interviewer.hourlyRate !== undefined && interviewer.hourlyRate !== null ? interviewer.hourlyRate : 0;

    const newInterview = new Interview({
      candidateId,
      interviewerId,
      date,
      timeSlot,
      topic: topic || 'Mock Technical Interview',
      price,
      notes: notes || '',
      status: 'scheduled',
      paidAmount: price,
      platformFee: 0,
      paymentStatus: price === 0 ? 'paid' : 'unpaid'
    });

    const savedInterview = await newInterview.save();
    
    const populated = await Interview.findById(savedInterview._id)
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email avatar title company hourlyRate');

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/interviews
// @desc    Get interviews for the logged in user (ownership enforced)
// @access  Protected
router.get('/', async (req, res) => {
  try {
    const user = req.user;
    let filter = {};

    if (user.role === 'admin') {
      // Admin can filter by query params or view all
      const { userId, role } = req.query;
      if (userId) {
        if (role === 'professional') filter.interviewerId = userId;
        else if (role === 'candidate') filter.candidateId = userId;
        else filter.$or = [{ candidateId: userId }, { interviewerId: userId }];
      }
    } else if (user.role === 'professional') {
      // Professional only sees their own sessions
      filter = { interviewerId: user._id };
    } else {
      // Candidate only sees their own interviews
      filter = { candidateId: user._id };
    }

    const interviews = await Interview.find(filter)
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email avatar title company hourlyRate')
      .sort({ createdAt: -1 });

    res.json(interviews);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/interviews/:id
// @desc    Get single interview details (Ownership enforced)
// @access  Protected
router.get('/:id', async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id)
      .populate('candidateId', 'name email avatar role')
      .populate('interviewerId', 'name email avatar role title company hourlyRate');

    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview not found' });
    }

    // Ownership check
    const isCandidate = interview.candidateId?._id?.toString() === req.user._id.toString();
    const isInterviewer = interview.interviewerId?._id?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isCandidate && !isInterviewer && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You do not have permission to view this interview.'
      });
    }

    res.json(interview);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/interviews/:id/status
// @desc    Update interview status (Ownership enforced)
// @access  Protected
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['scheduled', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    const interview = await Interview.findById(req.params.id);
    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview not found' });
    }

    const isCandidate = interview.candidateId.toString() === req.user._id.toString();
    const isInterviewer = interview.interviewerId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isCandidate && !isInterviewer && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Forbidden: Unauthorized to update this interview status.' });
    }

    // Candidates can only cancel
    if (isCandidate && !isAdmin && !isInterviewer && status !== 'cancelled') {
      return res.status(403).json({ success: false, message: 'Candidates may only cancel their scheduled interviews.' });
    }

    interview.status = status;

    if (status === 'cancelled') {
      const { cancelReason } = req.body;
      interview.cancelledAt = new Date();
      interview.cancellationReason = cancelReason || 'Cancelled by user';

      // Automatically release the booked availability slot
      await releaseSlotForInterview(interview._id);

      // Evaluate refund policy from Settings
      const settings = await Settings.getSettings();
      const refundWindowHours = settings.refundWindowHours || 24;

      let refundEligible = false;
      if (interview.startTime) {
        const diffHours = (new Date(interview.startTime) - new Date()) / (1000 * 60 * 60);
        refundEligible = diffHours >= refundWindowHours;
      } else {
        refundEligible = true; // If no startTime recorded, default eligible
      }

      if (refundEligible && interview.paymentStatus === 'paid' && interview.paidAmount > 0) {
        interview.refundAmount = interview.paidAmount;
        interview.paymentStatus = 'refunded';
      }
    }

    await interview.save();

    const populated = await Interview.findById(interview._id)
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email avatar title company');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/interviews/:id/questions
// @desc    Save actual questions and transcript during live session (Interviewer or Admin only)
// @access  Protected
router.post('/:id/questions', async (req, res) => {
  try {
    const { questions, transcript } = req.body;
    const interview = await Interview.findById(req.params.id);
    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview not found' });
    }

    const isInterviewer = interview.interviewerId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isInterviewer && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only the interviewer or admin can record session questions.'
      });
    }

    if (questions && Array.isArray(questions)) {
      interview.questions = questions;
    }
    if (transcript && Array.isArray(transcript)) {
      interview.transcript = transcript;
    }
    await interview.save();

    res.json({ success: true, message: 'Interview questions and answers saved successfully', interview });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/interviews/:id/questions
// @desc    Get live questions for an interview (Ownership enforced)
// @access  Protected
router.get('/:id/questions', async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id);
    if (!interview) return res.status(404).json({ success: false, message: 'Interview not found' });

    const isCandidate = interview.candidateId.toString() === req.user._id.toString();
    const isInterviewer = interview.interviewerId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isCandidate && !isInterviewer && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Forbidden: Access denied to interview questions.' });
    }

// @route   GET /api/interviews/:id/room-access
// @desc    Verify room access, timing window, and get ICE/TURN credentials
// @access  Protected
router.get('/:id/room-access', async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id)
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email avatar title company');

    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview session not found.' });
    }

    const isCandidate = String(interview.candidateId?._id) === String(req.user._id);
    const isInterviewer = String(interview.interviewerId?._id) === String(req.user._id);
    const isAdmin = req.user.role === 'admin';

    if (!isCandidate && !isInterviewer && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You are not a registered participant in this mock interview session.'
      });
    }

    if (interview.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'This interview was cancelled and the room is no longer accessible.'
      });
    }

    // Dynamic ICE / STUN / TURN servers from environment
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];

    if (process.env.TURN_URL) {
      iceServers.push({
        urls: process.env.TURN_URL,
        username: process.env.TURN_USERNAME || '',
        credential: process.env.TURN_CREDENTIAL || ''
      });
    }

    res.json({
      success: true,
      meetingRoomId: interview.meetingRoomId || `room_${interview._id}`,
      iceServers,
      interview,
      userRole: isInterviewer ? 'interviewer' : 'candidate'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/interviews/:id/chat
// @desc    Append chat message to interview transcript incrementally
// @access  Protected
router.post('/:id/chat', async (req, res) => {
  try {
    const { text, sender } = req.body;
    if (!text) return res.status(400).json({ success: false, message: 'Text is required' });

    const interview = await Interview.findById(req.params.id);
    if (!interview) return res.status(404).json({ success: false, message: 'Interview not found' });

    const chatItem = {
      role: sender || req.user.name,
      text,
      timestamp: new Date()
    };

    if (!Array.isArray(interview.transcript)) interview.transcript = [];
    interview.transcript.push(chatItem);
    await interview.save();

    res.json({ success: true, chatItem });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
