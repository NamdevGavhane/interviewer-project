const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
    required: function() {
      return this.accountStatus !== 'invited';
    },
  },
  role: {
    type: String,
    enum: ['professional', 'candidate', 'admin'],
    default: 'candidate',
  },
  accountStatus: {
    type: String,
    enum: ['invited', 'pending', 'active', 'deactivated'],
    default: 'active',
  },
  isDeactivated: {
    type: Boolean,
    default: false,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved',
  },
  experience: String,
  linkedin: String,
  rejectionReason: String,
  title: String,
  designation: String,
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
  },
  invitationToken: {
    type: String,
    index: true,
  },
  invitationExpires: {
    type: Date,
  },
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  invitedAt: {
    type: Date,
  },
  acceptedAt: {
    type: Date,
  }
}, { timestamps: true });

// Pre-save hook: Hash password securely using bcrypt
userSchema.pre('save', async function() {
  if (this.isModified('password') && this.password) {
    if (!this.password.startsWith('$2a$') && !this.password.startsWith('$2b$')) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    }
  }
  if (this.designation && !this.title) {
    this.title = this.designation;
  }
  if (this.title && !this.designation) {
    this.designation = this.title;
  }
});

// Compare password securely
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password || !candidatePassword) return false;
  if (this.password.startsWith('$2a$') || this.password.startsWith('$2b$')) {
    return bcrypt.compare(candidatePassword, this.password);
  }
  return candidatePassword === this.password;
};

module.exports = mongoose.model('User', userSchema);

