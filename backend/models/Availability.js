const mongoose = require('mongoose');

const availabilitySchema = new mongoose.Schema({
  interviewerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // Date in YYYY-MM-DD
  date: {
    type: String,
    required: true,
    index: true
  },
  // Formatted slot string for display (e.g. "10:00 AM - 10:45 AM")
  slotLabel: {
    type: String,
    required: true
  },
  // ISO Date times stored in UTC
  startTime: {
    type: Date,
    required: true,
    index: true
  },
  endTime: {
    type: Date,
    required: true
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  isBooked: {
    type: Boolean,
    default: false,
    index: true
  },
  interviewId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Interview',
    default: null
  },
  reservedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reservedUntil: {
    type: Date,
    default: null,
    index: true
  }
}, { timestamps: true });

// CRITICAL UNIQUE COMPOUND INDEX: Guarantees at database level that an interviewer can never have duplicate slots at the same startTime
availabilitySchema.index({ interviewerId: 1, startTime: 1 }, { unique: true });
availabilitySchema.index({ interviewerId: 1, date: 1, isBooked: 1 });

module.exports = mongoose.model('Availability', availabilitySchema);
