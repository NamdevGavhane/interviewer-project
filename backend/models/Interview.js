const mongoose = require('mongoose');
const crypto = require('crypto');

const interviewSchema = new mongoose.Schema({
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  interviewerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  date: {
    type: String,
    required: true,
  },
  timeSlot: {
    type: String,
    required: true,
  },
  slotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Availability',
    default: null,
  },
  startTime: {
    type: Date,
    default: null,
  },
  endTime: {
    type: Date,
    default: null,
  },
  topic: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  status: {
    type: String,
    enum: ['scheduled', 'completed', 'cancelled', 'rescheduled'],
    default: 'scheduled',
    index: true,
  },
  meetingRoomId: {
    type: String,
    default: () => `room_${crypto.randomBytes(6).toString('hex')}`,
  },
  notes: {
    type: String,
    default: '',
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'paid', 'refunded'],
    default: 'unpaid',
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
    default: 0,
  },
  platformFee: {
    type: Number,
    default: 0,
  },
  gstAmount: {
    type: Number,
    default: 0,
  },
  paymentMethod: {
    type: String,
    default: '',
  },
  invoiceNumber: {
    type: String,
    default: '',
  },
  cancellationReason: {
    type: String,
    default: '',
  },
  cancelledAt: {
    type: Date,
    default: null,
  },
  refundAmount: {
    type: Number,
    default: 0,
  },
  refundId: {
    type: String,
    default: '',
  },
  questions: [
    {
      question: { type: String, required: true },
      candidateAnswer: { type: String, default: '' },
      feedback: { type: String, default: '' },
      score: { type: Number, default: null }
    }
  ],
  transcript: [
    {
      sender: { type: String },
      text: { type: String },
      time: { type: String }
    }
  ],
  reminderSent24h: {
    type: Boolean,
    default: false,
    index: true
  },
  reminderSent1h: {
    type: Boolean,
    default: false,
    index: true
  }
}, { timestamps: true });

interviewSchema.index({ candidateId: 1, status: 1 });
interviewSchema.index({ interviewerId: 1, status: 1 });
interviewSchema.index({ date: 1, timeSlot: 1 });
interviewSchema.index({ status: 1, startTime: 1, reminderSent24h: 1 });
interviewSchema.index({ status: 1, startTime: 1, reminderSent1h: 1 });

module.exports = mongoose.model('Interview', interviewSchema);

