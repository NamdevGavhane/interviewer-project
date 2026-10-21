const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
  interviewerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'rejected', 'failed'],
    default: 'pending'
  },
  payoutMethod: {
    type: String,
    enum: ['bank_transfer', 'upi'],
    default: 'bank_transfer'
  },
  bankDetails: {
    accountNumber: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    beneficiaryName: { type: String, default: '' },
    upiId: { type: String, default: '' }
  },
  referenceId: {
    type: String,
    default: ''
  },
  notes: {
    type: String,
    default: ''
  },
  processedAt: {
    type: Date
  }
}, { timestamps: true });

payoutSchema.index({ interviewerId: 1, createdAt: -1 });
payoutSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Payout', payoutSchema);
