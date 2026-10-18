const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');
const Interview = require('../models/Interview');
const { authenticate, requireRole } = require('../middleware/auth');

// All feedback routes require authentication
router.use(authenticate);

// @route   POST /api/feedbacks
// @desc    Submit evaluation feedback for an interview (Only assigned interviewer or admin, only after session)
// @access  Protected
router.post('/', async (req, res) => {
  try {
    const {
      interviewId,
      overallScore,
      technicalScore,
      communicationScore,
      relevanceScore,
      qaList,
      strengths,
      improvements,
      suggestedTopics,
      detailedNotes
    } = req.body;

    if (!interviewId) {
      return res.status(400).json({ success: false, message: 'interviewId is required.' });
    }

    const interview = await Interview.findById(interviewId);
    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview session not found.' });
    }

    const isInterviewer = interview.interviewerId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isInterviewer && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only the interviewer of this session can submit feedback.'
      });
    }

    if (overallScore === undefined || overallScore === null) {
      return res.status(400).json({
        success: false,
        message: 'Overall score must be provided by the evaluator.'
      });
    }

    let feedback = await Feedback.findOne({ interviewId });

    if (feedback) {
      // Update existing feedback
      feedback.overallScore = Number(overallScore);
      if (technicalScore !== undefined) feedback.technicalScore = Number(technicalScore);
      if (communicationScore !== undefined) feedback.communicationScore = Number(communicationScore);
      if (relevanceScore !== undefined) feedback.relevanceScore = Number(relevanceScore);
      if (qaList) feedback.qaList = qaList;
      if (strengths) feedback.strengths = strengths;
      if (improvements) feedback.improvements = improvements;
      if (suggestedTopics) feedback.suggestedTopics = suggestedTopics;
      if (detailedNotes !== undefined) feedback.detailedNotes = detailedNotes;
      await feedback.save();
    } else {
      // Create new feedback from real provided inputs (NO fake defaults!)
      feedback = new Feedback({
        interviewId,
        candidateId: interview.candidateId,
        interviewerId: interview.interviewerId,
        overallScore: Number(overallScore),
        technicalScore: technicalScore !== undefined ? Number(technicalScore) : Number(overallScore),
        communicationScore: communicationScore !== undefined ? Number(communicationScore) : Number(overallScore),
        relevanceScore: relevanceScore !== undefined ? Number(relevanceScore) : Number(overallScore),
        qaList: Array.isArray(qaList) ? qaList : [],
        strengths: Array.isArray(strengths) ? strengths : [],
        improvements: Array.isArray(improvements) ? improvements : [],
        suggestedTopics: Array.isArray(suggestedTopics) ? suggestedTopics : [],
        detailedNotes: detailedNotes || ''
      });
      await feedback.save();
    }

    // Mark interview as completed
    interview.status = 'completed';
    if (qaList && Array.isArray(qaList) && qaList.length > 0) {
      interview.questions = qaList;
    }
    await interview.save();

    // Recalculate real aggregate rating for the interviewer
    const allFeedbacks = await Feedback.find({ interviewerId: interview.interviewerId });
    if (allFeedbacks.length > 0) {
      const totalScore = allFeedbacks.reduce((acc, f) => acc + (f.overallScore || 0), 0);
      const avgScore = totalScore / allFeedbacks.length;
      const starRating = Number((avgScore / 20).toFixed(1)); // Convert 100-pt to 5.0 star scale
      await require('../models/User').findByIdAndUpdate(interview.interviewerId, {
        rating: Math.min(5.0, Math.max(1.0, starRating)),
        reviewsCount: allFeedbacks.length
      });
    }

    const populated = await Feedback.findById(feedback._id)
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email avatar title company')
      .populate('interviewId');

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/feedbacks/interview/:interviewId
// @desc    Get feedback report for a specific interview (Ownership enforced; returns 404 if not submitted yet)
// @access  Protected
router.get('/interview/:interviewId', async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.interviewId);
    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview not found.' });
    }

    const isCandidate = interview.candidateId.toString() === req.user._id.toString();
    const isInterviewer = interview.interviewerId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isCandidate && !isInterviewer && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You do not have permission to view feedback for this session.'
      });
    }

    const feedback = await Feedback.findOne({ interviewId: req.params.interviewId })
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email avatar title company')
      .populate('interviewId');

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: 'Evaluation feedback has not been submitted yet for this session.',
        notSubmitted: true
      });
    }

    res.json(feedback);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/feedbacks/candidate/:candidateId
// @desc    Get all feedback reports for a candidate (Candidate self or Admin)
// @access  Protected
router.get('/candidate/:candidateId', async (req, res) => {
  try {
    const isSelf = req.user._id.toString() === req.params.candidateId;
    const isAdmin = req.user.role === 'admin';

    if (!isSelf && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You can only view your own feedback reports.'
      });
    }

    const feedbacks = await Feedback.find({ candidateId: req.params.candidateId })
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email avatar title company')
      .populate('interviewId')
      .sort({ createdAt: -1 });

    res.json(feedbacks);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
