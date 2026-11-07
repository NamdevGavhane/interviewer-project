const mongoose = require('mongoose');

const extensionHistorySchema = new mongoose.Schema({
  extendedByDays: {
    type: Number,
    required: true,
    default: 7
  },
  reason: {
    type: String,
    required: true
  },
  interviewId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Interview',
    required: true
  },
  previousExpiresAt: {
    type: Date,
    required: true
  },
  newExpiresAt: {
    type: Date,
    required: true
  },
  extendedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const batchSchema = new mongoose.Schema({
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
  interviewId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Interview',
    default: null,
    index: true
  },
  orderId: {
    type: String,
    index: true,
    sparse: true
  },
  paymentId: {
    type: String,
    sparse: true
  },
  // Immutable snapshot of Professional's batch validity at purchase time (Requirement 3)
  validityDaysSnapshot: {
    type: Number,
    required: true,
    min: 1,
    max: 365
  },
  activatedAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'completed', 'cancelled'],
    default: 'active',
    index: true
  },
  // Extension history to audit and prevent duplicate extensions (Requirements 6 & 7)
  extensions: [extensionHistorySchema]
}, { timestamps: true });

// Compound indexes for fast candidate & professional lookups and auto-expiry sweeps
batchSchema.index({ candidateId: 1, interviewerId: 1, status: 1 });
batchSchema.index({ status: 1, expiresAt: 1 });
batchSchema.index({ orderId: 1, candidateId: 1 });

// Helper to determine if batch is currently expired
batchSchema.methods.isExpired = function() {
  return this.status === 'expired' || new Date() > this.expiresAt;
};

module.exports = mongoose.model('Batch', batchSchema);
