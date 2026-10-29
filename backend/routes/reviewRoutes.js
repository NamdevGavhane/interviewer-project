const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Review = require('../models/Review');
const Interview = require('../models/Interview');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const { validateObjectId } = require('../middleware/validateObjectId');

// @route   POST /api/reviews
// @desc    Candidate submits a rating and review for their interviewer after session completion (F1)
// @access  Protected (Candidate only)
router.post('/', authenticate, async (req, res) => {
  try {
    const { interviewId, rating, comment } = req.body;

    if (!interviewId || !mongoose.Types.ObjectId.isValid(interviewId)) {
      return res.status(400).json({ success: false, message: 'Valid Interview ID is required.' });
    }

    const numRating = Number(rating);
    if (!numRating || numRating < 1 || numRating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be an integer between 1 and 5.' });
    }

    const interview = await Interview.findById(interviewId);
    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview session not found.' });
    }

    // Only the candidate who attended this interview can review the interviewer
    if (String(interview.candidateId) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only the candidate who booked this interview can review the interviewer.'
      });
    }

    // Interview must be completed
    if (interview.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot review an interview that has not been marked completed.'
      });
    }

    // Prevent duplicate review submissions (1 review per interview)
    const existingReview = await Review.findOne({ interviewId });
    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: 'You have already submitted a review for this interview session.'
      });
    }

    const review = new Review({
      interviewId,
      candidateId: req.user._id,
      interviewerId: interview.interviewerId,
      rating: Math.round(numRating),
      comment: comment ? String(comment).trim().slice(0, 1000) : ''
    });

    const savedReview = await review.save();

    // Recalculate interviewer's authentic public rating and reviews count (F1)
    const interviewerReviews = await Review.find({ interviewerId: interview.interviewerId });
    if (interviewerReviews.length > 0) {
      const totalStars = interviewerReviews.reduce((sum, r) => sum + r.rating, 0);
      const avgRating = Number((totalStars / interviewerReviews.length).toFixed(1));
      await User.findByIdAndUpdate(interview.interviewerId, {
        rating: avgRating,
        reviewsCount: interviewerReviews.length
      });
    }

    const populatedReview = await Review.findById(savedReview._id)
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email title company');

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully! Thank you for rating your interviewer.',
      review: populatedReview
    });
  } catch (err) {
    console.error('Error submitting review:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/reviews/interview/:interviewId
// @desc    Get the review submitted for a specific interview
// @access  Protected
router.get('/interview/:interviewId', validateObjectId('interviewId'), authenticate, async (req, res) => {
  try {
    const review = await Review.findOne({ interviewId: req.params.interviewId })
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email title company');

    if (!review) {
      return res.status(404).json({ success: false, message: 'No review submitted for this interview yet.' });
    }

    res.json(review);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/reviews/interviewer/:interviewerId
// @desc    Get all candidate reviews for an interviewer
// @access  Public
router.get('/interviewer/:interviewerId', validateObjectId('interviewerId'), async (req, res) => {
  try {
    const reviews = await Review.find({ interviewerId: req.params.interviewerId })
      .populate('candidateId', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(reviews);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
