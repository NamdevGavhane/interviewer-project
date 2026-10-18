const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  platformCommissionPercent: {
    type: Number,
    default: 10,
    min: 0,
    max: 100
  },
  gstPercent: {
    type: Number,
    default: 18,
    min: 0,
    max: 100
  },
  currency: {
    type: String,
    default: 'INR'
  },
  refundWindowHours: {
    type: Number,
    default: 24,
    min: 0
  },
  bookingWindowDays: {
    type: Number,
    default: 14,
    min: 1,
    max: 90
  },
  slotDurationMinutes: {
    type: Number,
    default: 45,
    min: 15,
    max: 180
  },
  slotPresets: {
    type: [String],
    default: [
      '09:00 AM - 09:45 AM',
      '10:00 AM - 10:45 AM',
      '11:00 AM - 11:45 AM',
      '02:00 PM - 02:45 PM',
      '03:30 PM - 04:15 PM',
      '05:00 PM - 05:45 PM',
      '06:30 PM - 07:15 PM',
      '07:30 PM - 08:15 PM',
      '08:30 PM - 09:15 PM'
    ]
  },
  aiDailyLimit: {
    type: Number,
    default: 5,
    min: 1
  },
  supportEmail: {
    type: String,
    default: 'support@interviewpro.com'
  },
  siteName: {
    type: String,
    default: 'InterviewPro'
  }
}, { timestamps: true });

// Singleton helper to get active settings or create defaults
settingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

module.exports = mongoose.model('Settings', settingsSchema);
