const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
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
  interviewId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Interview',
    required: false,
  },
  orderId: {
    type: String,
    required: true,
    index: true,
  },
  paymentId: {
    type: String,
    required: true,
    unique: true,
  },
  signature: {
    type: String,
    default: '',
  },
  amount: {
    type: Number,
    required: true,
  },
  sessionFee: {
    type: Number,
    required: true,
    default: 100,
  },
  platformFee: {
    type: Number,
    default: 10,
  },
  gstAmount: {
    type: Number,
    default: 0,
  },
  refundId: {
    type: String,
    default: '',
  },
  refundAmount: {
    type: Number,
    default: 0,
  },
  refundStatus: {
    type: String,
    enum: ['none', 'pending', 'processed', 'failed'],
    default: 'none',
  },
  refundedAt: {
    type: Date,
  },
  currency: {
    type: String,
    default: 'INR',
  },
  status: {
    type: String,
    enum: ['created', 'captured', 'failed', 'refunded'],
    default: 'captured',
  },
  paymentMethod: {
    type: String,
    enum: ['upi', 'card', 'netbanking', 'wallet', 'razorpay', 'free'],
    default: 'razorpay',
  },
  paymentDetails: {
    upiId: { type: String, default: '' },
    utrNumber: { type: String, default: '' },
    cardLast4: { type: String, default: '' },
    cardNetwork: { type: String, default: '' },
    bankName: { type: String, default: '' },
    walletName: { type: String, default: '' },
  },
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
  },
  receiptUrl: {
    type: String,
    default: '',
  },
  notes: {
    type: String,
    default: '',
  }
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
