const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true,
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
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  emailVerificationToken: {
    type: String,
    select: false,
    index: true,
  },
  emailVerificationExpires: {
    type: Date,
    select: false,
  },
  resetPasswordToken: {
    type: String,
    select: false,
    index: true,
  },
  resetPasswordExpires: {
    type: Date,
    select: false,
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved',
  },
  experience: {
    type: String,
    default: '',
  },
  linkedin: {
    type: String,
    default: '',
  },
  rejectionReason: {
    type: String,
    default: '',
  },
  title: {
    type: String,
    default: '',
  },
  designation: {
    type: String,
    default: '',
  },
  company: {
    type: String,
    default: '',
  },
  domain: {
    type: String,
    default: '',
  },
  hourlyRate: {
    type: Number,
    default: null,
  },
  bio: {
    type: String,
    default: '',
  },
  skills: {
    type: [String],
    default: [],
  },
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
    default: [],
  },
  avatar: {
    type: String,
    default: '',
  },
  invitationToken: {
    type: String,
    select: false,
    index: true,
  },
  invitationExpires: {
    type: Date,
    select: false,
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
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.resetPasswordToken;
      delete ret.resetPasswordExpires;
      delete ret.emailVerificationToken;
      delete ret.emailVerificationExpires;
      delete ret.invitationToken;
      delete ret.invitationExpires;
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.resetPasswordToken;
      delete ret.resetPasswordExpires;
      delete ret.emailVerificationToken;
      delete ret.emailVerificationExpires;
      delete ret.invitationToken;
      delete ret.invitationExpires;
      delete ret.__v;
      return ret;
    }
  }
});

userSchema.index({ role: 1, accountStatus: 1, approvalStatus: 1, isVerified: 1 });

// Static helper to create SHA-256 token hash
userSchema.statics.hashToken = function(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return '';
  return crypto.createHash('sha256').update(rawToken).digest('hex');
};

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
