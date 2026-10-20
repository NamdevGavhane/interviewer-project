const mongoose = require('mongoose');

const pendingBookingSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  interviewerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  slotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Availability',
    required: true,
    index: true
  },
  topic: {
    type: String,
    default: 'Mock Technical Interview'
  },
  notes: {
    type: String,
    default: ''
  },
  // Frozen financial figures (P7 / P2)
  sessionFee: {
    type: Number,
    required: true
  },
  platformFee: {
    type: Number,
    required: true
  },
  gstAmount: {
    type: Number,
    required: true
  },
  amount: {
    type: Number,
    required: true // Total amount in INR
  },
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'expired'],
    default: 'pending',
    index: true
  },
  paymentId: {
    type: String,
    default: null
  },
  interviewId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Interview',
    default: null
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // TTL index automatically expires documents after expiresAt
  }
}, { timestamps: true });

module.exports = mongoose.model('PendingBooking', pendingBookingSchema);
