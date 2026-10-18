const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  interviewId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Interview',
    required: true,
    unique: true
  },
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  interviewerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  overallScore: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  technicalScore: {
    type: Number,
    min: 0,
    max: 100
  },
  communicationScore: {
    type: Number,
    min: 0,
    max: 100
  },
  relevanceScore: {
    type: Number,
    min: 0,
    max: 100
  },
  qaList: [
    {
      question: {
        type: String,
        required: true,
      },
      candidateAnswer: {
        type: String,
        default: '',
      },
      feedback: {
        type: String,
        default: '',
      },
      score: {
        type: Number,
        min: 0,
        max: 100
      }
    }
  ],
  strengths: {
    type: [String],
    default: [],
  },
  improvements: {
    type: [String],
    default: [],
  },
  suggestedTopics: {
    type: [String],
    default: [],
  },
  detailedNotes: {
    type: String,
    default: '',
  }
}, { timestamps: true });

module.exports = mongoose.model('Feedback', feedbackSchema);
