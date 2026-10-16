const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['professional', 'candidate', 'admin'],
    default: 'candidate',
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  title: String,
  company: String,
  domain: String,
  hourlyRate: Number,
  bio: String,
  skills: [String],
  rating: {
    type: Number,
    default: 0,
  },
  reviewsCount: {
    type: Number,
    default: 0,
  },
  availabilitySlots: {
    type: [String],
    default: ['10:00 AM - 10:45 AM', '02:00 PM - 02:45 PM', '05:00 PM - 05:45 PM', '07:00 PM - 07:45 PM']
  },
  avatar: {
    type: String,
    default: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80'
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
