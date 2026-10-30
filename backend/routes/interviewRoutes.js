const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const Interview = require('../models/Interview');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Availability = require('../models/Availability');
const Counter = require('../models/Counter');
const Settings = require('../models/Settings');
const { releaseSlotForInterview, confirmBookedSlot } = require('../services/availabilityService');
const { processInterviewRefund } = require('../services/refundService');
const { authenticate, requireRole, requireActiveProfessional } = require('../middleware/auth');
const { chatLimiter } = require('../middleware/rateLimiter');
const { validateObjectId } = require('../middleware/validateObjectId');
const { getPagination } = require('../utils/pagination');

// Apply authentication to ALL interview routes
router.use(authenticate);

// @route   POST /api/interviews
// @desc    Book a new interview session (Free community session or Admin override; Paid sessions MUST use /api/payment/create-order)
// @access  Protected
router.post('/', async (req, res) => {
  try {
    const { interviewerId, slotId, topic, notes } = req.body;

    const candidateId = req.user.role === 'admin' && req.body.candidateId 
      ? req.body.candidateId 
      : req.user._id;

    if (!interviewerId || !slotId) {
      return res.status(400).json({ success: false, message: 'Missing required booking fields (interviewerId and slotId).' });
    }

    if (!mongoose.Types.ObjectId.isValid(interviewerId) || !mongoose.Types.ObjectId.isValid(slotId)) {
      return res.status(400).json({ success: false, message: 'Invalid interviewerId or slotId format.' });
    }

    // Ensure interviewer is an active, verified professional
    const interviewer = await User.findById(interviewerId);
    if (!interviewer || interviewer.role !== 'professional' || interviewer.isDeactivated || interviewer.accountStatus !== 'active' || !interviewer.isVerified) {
      return res.status(400).json({ success: false, message: 'Selected interviewer is not an active verified professional.' });
    }

    // Security Gate: Direct unpaid booking bypass prevention
    if (req.user.role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'This is a paid session. Direct scheduling without payment is prohibited. Please use the checkout flow (/api/payment/create-order).'
      });
    }

    const settings = await Settings.getSettings();
    const mockPricePaise = settings.mockSessionPricePaise ?? 5000;
    const sessionFee = mockPricePaise / 100;
    const interviewerSharePercent = settings.interviewerSharePercent ?? 70;
    const interviewerEarningsPaise = Math.round((mockPricePaise * interviewerSharePercent) / 100);

    // Validate slot
    const slotDoc = await Availability.findById(slotId);
    if (!slotDoc || String(slotDoc.interviewerId) !== String(interviewerId)) {
      return res.status(404).json({ success: false, message: 'Availability slot not found or does not belong to this interviewer.' });
    }
    if (slotDoc.isBooked) {
      return res.status(409).json({
        success: false,
        message: 'This time slot is already booked. Please choose another slot.'
      });
    }

    const meetingRoomId = crypto.randomBytes(8).toString('hex');
    const invoiceNumber = await Counter.getNextInvoiceNumber();

    const newInterview = new Interview({
      candidateId,
      interviewerId,
      date: slotDoc.date,
      timeSlot: slotDoc.slotLabel,
      slotId: slotDoc._id,
      startTime: slotDoc.startTime,
      endTime: slotDoc.endTime,
      topic: topic || 'Mock Technical Interview',
      price: sessionFee,
      paidAmount: sessionFee,
      amountPaise: mockPricePaise,
      interviewerEarningsPaise,
      platformFee: 0,
      notes: notes || '',
      status: 'scheduled',
      paymentStatus: 'paid',
      paymentMethod: 'admin_comp',
      invoiceNumber,
      meetingRoomId
    });

    const savedInterview = await newInterview.save();

    // Atomically confirm slot booking in Availability
    await confirmBookedSlot({
      slotId,
      candidateId,
      interviewId: savedInterview._id
    });

    // Create Payment audit record for admin comp session
    const payment = new Payment({
      candidateId,
      interviewerId,
      interviewId: savedInterview._id,
      orderId: `COMP_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      paymentId: `COMP_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      amount: sessionFee,
      amountPaise: mockPricePaise,
      sessionFee,
      platformFee: 0,
      gstAmount: 0,
      status: 'captured',
      paymentMethod: 'admin_comp',
      invoiceNumber,
      notes: notes || 'Admin complimentary session booking'
    });
    await payment.save();

    const populated = await Interview.findById(savedInterview._id)
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email avatar title company');

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

    const { page, limit, skip, formatMeta } = getPagination(req.query, 20);

    const [total, interviews] = await Promise.all([
      Interview.countDocuments(filter),
      Interview.find(filter)
        .populate('candidateId', 'name email avatar')
        .populate('interviewerId', 'name email avatar title company')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
    ]);

    res.json({
      success: true,
      data: interviews,
      pagination: formatMeta(total)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/interviews/:id
// @desc    Get single interview details (Ownership enforced)
// @access  Protected
router.get('/:id', validateObjectId('id'), async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id)
      .populate('candidateId', 'name email avatar role')
      .populate('interviewerId', 'name email avatar role title company');

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
// @desc    Update interview status (Ownership enforced; unified refunding for cancellations)
// @access  Protected
router.patch('/:id/status', validateObjectId('id'), async (req, res) => {
  try {
    const { status, cancelReason } = req.body;
    if (status === 'completed') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only the server can set completed, never a client PATCH.'
      });
    }

    if (status !== 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value. Only cancellation may be requested via this endpoint.'
      });
    }

    const interview = await Interview.findById(req.params.id);
    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview not found.' });
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

    // Unified cancellation & refund handling (P5)
    if (status === 'cancelled') {
      const refundResult = await processInterviewRefund({
        interviewId: interview._id,
        requestedByUserId: req.user._id,
        userRole: req.user.role,
        reason: cancelReason || 'Cancelled by user'
      });

      if (!refundResult.success) {
        return res.status(refundResult.status || 400).json(refundResult);
      }

      const populated = await Interview.findById(interview._id)
        .populate('candidateId', 'name email avatar')
        .populate('interviewerId', 'name email avatar title company');

      return res.json({
        ...refundResult,
        interview: populated
      });
    }

    interview.status = status;
    if (status === 'completed') {
      interview.completedAt = new Date();
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
router.post('/:id/questions', validateObjectId('id'), async (req, res) => {
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
router.get('/:id/questions', validateObjectId('id'), async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id);
    if (!interview) return res.status(404).json({ success: false, message: 'Interview not found' });

    const isCandidate = interview.candidateId.toString() === req.user._id.toString();
    const isInterviewer = interview.interviewerId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isCandidate && !isInterviewer && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Forbidden: Access denied to interview questions.' });
    }

    res.json({
      success: true,
      questions: interview.questions || [],
      transcript: interview.transcript || []
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/interviews/:id/room-access
// @desc    Verify room access, timing window, and get ICE/TURN credentials
// @access  Protected
router.get('/:id/room-access', validateObjectId('id'), async (req, res) => {
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

    // Payment Gate (P1): Only paid sessions can access live interview room
    if (interview.paymentStatus !== 'paid' && interview.paidAmount > 0) {
      return res.status(402).json({
        success: false,
        message: 'Payment required to access interview room. Please complete checkout.'
      });
    }

    // Timing window check: Room is open for both candidate & interviewer anytime before conclusion
    if (!isAdmin && interview.startTime) {
      if (['completed', 'cancelled', 'expired', 'interviewer_no_show', 'candidate_no_show'].includes(interview.status)) {
        return res.status(403).json({
          success: false,
          sessionEnded: true,
          message: 'session ended'
        });
      }
    }

    // Log joinedAt for participants (M2)
    const updateFields = {};
    if (isCandidate && !interview.candidateJoinedAt) {
      updateFields.candidateJoinedAt = new Date();
      interview.candidateJoinedAt = updateFields.candidateJoinedAt;
    }
    if (isInterviewer && !interview.interviewerJoinedAt) {
      updateFields.interviewerJoinedAt = new Date();
      interview.interviewerJoinedAt = updateFields.interviewerJoinedAt;
    }
    if (Object.keys(updateFields).length > 0) {
      await Interview.findByIdAndUpdate(interview._id, { $set: updateFields });
    }

    // Dynamic ICE / STUN / TURN servers from environment (H4)
    let iceServers = [];
    if (process.env.ICE_SERVERS) {
      try {
        iceServers = JSON.parse(process.env.ICE_SERVERS);
      } catch (e) {
        console.warn('[WEBRTC] Failed to parse ICE_SERVERS environment variable:', e.message);
      }
    }

    if (!Array.isArray(iceServers) || iceServers.length === 0) {
      iceServers = [
        { urls: process.env.STUN_URL || 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp'
          ],
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ];
    }

    if (process.env.TURN_URL) {
      iceServers.push({
        urls: process.env.TURN_URL,
        username: process.env.TURN_USERNAME || '',
        credential: process.env.TURN_CREDENTIAL || ''
      });
    } else if (process.env.NODE_ENV === 'production') {
      const hasTurn = Array.isArray(iceServers) && iceServers.some(s => {
        const u = s.urls;
        return typeof u === 'string' ? u.startsWith('turn:') : (Array.isArray(u) && u.some(entry => entry.startsWith('turn:')));
      });
      if (!hasTurn) {
        console.warn('[WEBRTC WARNING] No TURN relay server configured in production. P2P WebRTC calls behind symmetric NAT/cellular networks will fail. Please configure TURN_URL, TURN_USERNAME, and TURN_CREDENTIAL in production environment.');
      }
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
// @desc    Append chat message to interview transcript incrementally (Participants or Admin only)
// @access  Protected
router.post('/:id/chat', validateObjectId('id'), chatLimiter, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Message text is required.' });
    }

    const trimmedText = text.trim();
    if (trimmedText.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Message exceeds maximum allowed length of 2000 characters.'
      });
    }

    const interview = await Interview.findById(req.params.id);
    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview session not found.' });
    }

    const isCandidate = String(interview.candidateId) === String(req.user._id);
    const isInterviewer = String(interview.interviewerId) === String(req.user._id);
    const isAdmin = req.user.role === 'admin';

    if (!isCandidate && !isInterviewer && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only the candidate, assigned interviewer, or platform admin may send chat messages.'
      });
    }

    const senderRole = isCandidate ? 'candidate' : (isInterviewer ? 'interviewer' : 'admin');
    const chatItem = {
      role: `${req.user.name} (${senderRole})`,
      text: trimmedText,
      senderId: req.user._id,
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
