const mongoose = require('mongoose');

const availabilityRuleSchema = new mongoose.Schema({
  interviewerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // 0: Sunday, 1: Monday, ..., 6: Saturday
  dayOfWeek: {
    type: Number,
    required: true,
    min: 0,
    max: 6
  },
  // HH:mm in local 24-hr format (e.g. "10:00")
  startTime: {
    type: String,
    required: true
  },
  // HH:mm in local 24-hr format (e.g. "10:45")
  endTime: {
    type: String,
    required: true
  },
  slotLabel: {
    type: String,
    required: true
  },
  timezone: {
    type: String,
    default: 'Asia/Kolkata'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

availabilityRuleSchema.index({ interviewerId: 1, dayOfWeek: 1, startTime: 1 }, { unique: true });

module.exports = mongoose.model('AvailabilityRule', availabilityRuleSchema);
