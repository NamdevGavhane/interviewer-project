const express = require('express');
const router = express.Router();
const Batch = require('../models/Batch');
const User = require('../models/User');
const Interview = require('../models/Interview');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateObjectId } = require('../middleware/validateObjectId');

/**
 * Format a batch document with dynamic remaining days and computed validity
 */
const formatBatchResponse = (batch) => {
  const now = new Date();
  const expiresAt = new Date(batch.expiresAt);
  const isExpired = batch.status === 'expired' || now > expiresAt;
  const msRemaining = expiresAt.getTime() - now.getTime();
  const daysRemaining = isExpired ? 0 : Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
  const totalExtendedDays = (batch.extensions || []).reduce((acc, curr) => acc + (curr.extendedByDays || 0), 0);

  return {
    _id: batch._id,
    candidateId: batch.candidateId,
    interviewerId: batch.interviewerId,
    interviewId: batch.interviewId,
    orderId: batch.orderId,
    paymentId: batch.paymentId,
    validityDaysSnapshot: batch.validityDaysSnapshot,
    activatedAt: batch.activatedAt,
    expiresAt: batch.expiresAt,
    status: isExpired ? 'expired' : batch.status,
    isExpired,
    daysRemaining,
    totalExtendedDays,
    extensionsCount: (batch.extensions || []).length,
    extensions: batch.extensions || [],
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt
  };
};

// @route   GET /api/batches/my-batches
// @desc    Get candidate's active & past batches with remaining validity and extension history
// @access  Protected
router.get('/my-batches', authenticate, async (req, res) => {
  try {
    const batches = await Batch.find({ candidateId: req.user._id })
      .populate('interviewerId', '_id name title designation company avatar batchValidityDays')
      .populate('interviewId', '_id date timeSlot topic status meetingRoomId startTime')
      .sort({ createdAt: -1 })
      .lean();

    const formatted = batches.map(formatBatchResponse);

    res.json({
      success: true,
      data: formatted
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/batches/professional
// @desc    Get professional's enrolled candidate batches and validity status
// @access  Protected (Professional only)
router.get('/professional', authenticate, requireRole('professional'), async (req, res) => {
  try {
    const batches = await Batch.find({ interviewerId: req.user._id })
      .populate('candidateId', '_id name email avatar')
      .populate('interviewId', '_id date timeSlot topic status')
      .sort({ createdAt: -1 })
      .lean();

    const formatted = batches.map(formatBatchResponse);

    res.json({
      success: true,
      data: formatted
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/batches/:id
// @desc    Get single batch details and extension history
// @access  Protected (Candidate owner, assigned Professional, or Admin)
router.get('/:id', authenticate, validateObjectId('id'), async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.id)
      .populate('candidateId', '_id name email avatar')
      .populate('interviewerId', '_id name title designation company avatar batchValidityDays')
      .populate('interviewId', '_id date timeSlot topic status meetingRoomId')
      .lean();

    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found.' });
    }

    const isCandidate = String(batch.candidateId?._id || batch.candidateId) === String(req.user._id);
    const isInterviewer = String(batch.interviewerId?._id || batch.interviewerId) === String(req.user._id);
    const isAdmin = req.user.role === 'admin';

    if (!isCandidate && !isInterviewer && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Forbidden: You do not have permission to view this batch.' });
    }

    res.json({
      success: true,
      data: formatBatchResponse(batch)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/batches/validate-booking
// @desc    Validate if a candidate has an unexpired batch or if a proposed slot fits inside batch validity
// @access  Protected
router.post('/validate-booking', authenticate, async (req, res) => {
  try {
    const { interviewerId, slotStartTime } = req.body;
    if (!interviewerId) {
      return res.status(400).json({ success: false, message: 'Interviewer ID is required.' });
    }

    const batch = await Batch.findOne({
      candidateId: req.user._id,
      interviewerId
    }).sort({ createdAt: -1 });

    if (!batch) {
      return res.json({
        success: true,
        hasBatch: false,
        canBook: true,
        message: 'No existing batch; a new batch will be activated on payment.'
      });
    }

    const now = new Date();
    const isExpired = batch.status === 'expired' || now > new Date(batch.expiresAt);

    if (isExpired) {
      return res.status(400).json({
        success: false,
        hasBatch: true,
        canBook: false,
        isExpired: true,
        message: 'Batch validity has expired. Expired batches cannot be used for new bookings.'
      });
    }

    // If slotStartTime provided, ensure slot does not fall past batch expiry
    if (slotStartTime && new Date(slotStartTime) > new Date(batch.expiresAt)) {
      return res.status(400).json({
        success: false,
        hasBatch: true,
        canBook: false,
        message: `Selected slot is after your batch expiry date (${new Date(batch.expiresAt).toLocaleDateString()}). Please select a slot within your batch validity.`
      });
    }

    res.json({
      success: true,
      hasBatch: true,
      canBook: true,
      batch: formatBatchResponse(batch)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
