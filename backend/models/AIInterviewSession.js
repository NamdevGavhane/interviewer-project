const mongoose = require('mongoose');

const aiInterviewSessionSchema = new mongoose.Schema({
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  topic: {
    type: String,
    required: true
  },
  difficulty: {
    type: String,
    default: 'Mid-Level'
  },
  company: {
    type: String,
    default: 'Tech Industry'
  },
  resumeText: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['in_progress', 'completed', 'abandoned'],
    default: 'in_progress',
    index: true
  },
  turns: [
    {
      turnNumber: Number,
      question: String,
      candidateAnswer: String,
      feedback: String,
      score: Number,
      timestamp: { type: Date, default: Date.now }
    }
  ],
  totalQuestions: {
    type: Number,
    default: 4
  },
  currentQuestionIndex: {
    type: Number,
    default: 0
  },
  interviewId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Interview'
  },
  feedbackId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Feedback'
  }
}, { timestamps: true });

module.exports = mongoose.model('AIInterviewSession', aiInterviewSessionSchema);
