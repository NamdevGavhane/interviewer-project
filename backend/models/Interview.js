const mongoose = require('mongoose');

const interviewSchema = new mongoose.Schema({
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
  date: {
    type: String,
    required: true,
  },
  timeSlot: {
    type: String,
    required: true,
  },
  topic: {
    type: String,
    default: 'Frontend & Fullstack Mock Interview',
  },
  price: {
    type: Number,
    required: true,
    default: 100,
  },
  status: {
    type: String,
    enum: ['scheduled', 'completed', 'cancelled'],
    default: 'scheduled',
  },
  meetingRoomId: {
    type: String,
    default: () => 'room-' + Math.random().toString(36).substring(2, 9),
  },
  notes: {
    type: String,
    default: '',
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'paid', 'refunded'],
    default: 'paid',
  },
  paymentId: {
    type: String,
    default: '',
  },
  orderId: {
    type: String,
    default: '',
  },
  paidAmount: {
    type: Number,
    default: 110,
  },
  platformFee: {
    type: Number,
    default: 10,
  },
  paymentMethod: {
    type: String,
    default: 'upi',
  },
  invoiceNumber: {
    type: String,
    default: '',
  },
  questions: [
    {
      question: { type: String, required: true },
      candidateAnswer: { type: String, default: '' },
      feedback: { type: String, default: '' },
      score: { type: Number, default: 85 }
    }
  ],
  transcript: [
    {
      sender: { type: String },
      text: { type: String },
      time: { type: String }
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('Interview', interviewSchema);
