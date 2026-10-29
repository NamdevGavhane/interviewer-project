const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const Interview = require('../models/Interview');
const Settings = require('../models/Settings');
const Payout = require('../models/Payout');
const Notification = require('../models/Notification');
const { getFrontendBaseUrl } = require('../utils/urlHelper');
const { uploadAvatar, uploadToCloudinary } = require('../utils/avatarUpload');
const {
  generateAccessToken,
  generateRefreshToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  authenticate,
  requireRole,
  requireActiveProfessional,
  JWT_REFRESH_SECRET,
  JWT_SECRET
} = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const { validate } = require('../middleware/validate');
const {
  registerSchema,
  loginSchema,
  googleLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  acceptInviteSchema,
  updateUserSchema,
  registerProfessionalSchema
} = require('../validators/schemas');
const { authLimiter, passwordResetLimiter, professionalSignupLimiter } = require('../middleware/rateLimiter');
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
  isSmtpConfigured
} = require('../utils/mailer');
const mongoose = require('mongoose');
const { validateObjectId } = require('../middleware/validateObjectId');

const PUBLIC_PROFESSIONAL_FIELDS = '_id name title designation company domain bio skills rating reviewsCount avatar role accountStatus isVerified approvalStatus experience linkedin createdAt';

// Initialize Google OAuth2 Client
const getGoogleClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return null;
  return new OAuth2Client(clientId);
};

// @route   POST /api/users/register
// @desc    Register a new Candidate account with input validation and verification email
// @access  Public
router.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
  try {
    const { name, email, password, title, bio, skills, avatar } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    if (avatar && (avatar.startsWith('data:') || avatar.length > 2000)) {
      return res.status(400).json({
        success: false,
        message: 'Base64 avatars are not allowed. Please provide an image URL.'
      });
    }

    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists. Please log in.'
      });
    }

    let skillsArray = [];
    if (Array.isArray(skills)) {
      skillsArray = skills;
    } else if (typeof skills === 'string') {
      skillsArray = skills.split(',').map(s => s.trim()).filter(Boolean);
    }

    // Generate email verification token (crypto random) and store SHA-256 hash
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedVerificationToken = User.hashToken(verificationToken);
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const newUser = new User({
      name: name.trim(),
      email: cleanEmail,
      password,
      role: 'candidate',
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: false,
      isEmailVerified: false,
      emailVerificationToken: hashedVerificationToken,
      emailVerificationExpires: verificationExpires,
      isDeactivated: false,
      title: title || 'Candidate',
      bio: bio || '',
      skills: skillsArray,
      avatar: avatar || ''
    });

    await newUser.save();

    // Send verification email
    let verificationNotice = '';
    try {
      const origin = getFrontendBaseUrl();
      const emailResult = await sendVerificationEmail({
        name: newUser.name,
        email: newUser.email,
        token: verificationToken,
        frontendBaseUrl: origin
      });
      if (emailResult.sent) {
        verificationNotice = 'Verification email sent. Please check your inbox.';
      } else {
        verificationNotice = 'Email service not configured. You can continue testing in development.';
      }
    } catch (mailErr) {
      verificationNotice = 'Could not dispatch verification email: ' + mailErr.message;
    }

    const accessToken = generateAccessToken(newUser);
    const refreshToken = await generateRefreshToken(newUser, req);
    setRefreshTokenCookie(res, refreshToken);

    res.status(201).json({
      success: true,
      message: 'Account created successfully! ' + verificationNotice,
      data: {
        token: accessToken,
        user: {
          id: newUser._id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          avatar: newUser.avatar,
          isEmailVerified: newUser.isEmailVerified,
          isVerified: newUser.isVerified
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Registration failed: ' + err.message });
  }
});

// @route   POST /api/users/register-professional
// @desc    Register a new professional account (pending review) or re-apply if previously rejected
// @access  Public
router.post('/register-professional', professionalSignupLimiter, authLimiter, validate(registerProfessionalSchema), async (req, res) => {
  try {
    const { name, email, password, company, designation, experience, domain, linkedin, bio } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({ email: cleanEmail });

    if (!existingUser) {
      // New applicant
      const newUser = new User({
        name: name.trim(),
        email: cleanEmail,
        password,
        role: 'professional',
        accountStatus: 'pending',
        approvalStatus: 'pending',
        isVerified: false,
        isEmailVerified: false,
        appliedAt: new Date(),
        company: company.trim(),
        designation: designation.trim(),
        title: designation.trim(),
        experience: experience.trim(),
        domain: domain ? domain.trim() : '',
        linkedin: linkedin.trim(),
        bio: bio ? bio.trim() : '',
        availabilitySlots: []
      });

      await newUser.save();

      // Dispatch in-app notification to all active admins
      try {
        const activeAdmins = await User.find({
          role: 'admin',
          isDeactivated: { $ne: true },
          accountStatus: 'active'
        });
        if (activeAdmins.length > 0) {
          const notifications = activeAdmins.map(admin => ({
            userId: admin._id,
            type: 'system',
            title: 'New Professional Application',
            message: `${newUser.name} has applied to become an interviewer.`,
            link: '/admin?tab=requests'
          }));
          await Notification.insertMany(notifications);
        }
      } catch (notifyErr) {
        // Notification failure must never fail signup
      }

      return res.status(201).json({
        success: true,
        message: 'Application submitted successfully! Your account is pending administrator approval.',
        data: {
          email: newUser.email,
          status: 'pending'
        }
      });
    }

    // Existing user logic
    const isRejectedProfessional =
      existingUser.role === 'professional' &&
      existingUser.approvalStatus === 'rejected' &&
      !existingUser.isDeactivated &&
      existingUser.accountStatus !== 'deactivated';

    if (!isRejectedProfessional) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists. Please log in.'
      });
    }

    // Rejected professional re-applying: require original password
    const isMatch = await existingUser.comparePassword(password);
    if (!isMatch) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists. Please log in.'
      });
    }

    // Enforce waiting period from Settings.professionalReapplyAfterDays
    const settings = await Settings.getSettings();
    const reapplyDays = typeof settings.professionalReapplyAfterDays === 'number' ? settings.professionalReapplyAfterDays : 30;
    const decidedBaseDate = existingUser.decidedAt || existingUser.updatedAt || new Date();
    const canReapplyAfter = new Date(decidedBaseDate.getTime() + reapplyDays * 24 * 60 * 60 * 1000);
    const now = new Date();

    if (reapplyDays > 0 && now < canReapplyAfter) {
      return res.status(403).json({
        success: false,
        message: `You cannot reapply yet. Applications are subject to a ${reapplyDays}-day waiting period.`,
        canReapplyAfter
      });
    }

    // After waiting period: update profile fields and reset status
    existingUser.name = name.trim();
    existingUser.company = company.trim();
    existingUser.designation = designation.trim();
    existingUser.title = designation.trim();
    existingUser.experience = experience.trim();
    existingUser.domain = domain ? domain.trim() : '';
    existingUser.linkedin = linkedin.trim();
    existingUser.bio = bio ? bio.trim() : '';
    existingUser.approvalStatus = 'pending';
    existingUser.accountStatus = 'pending';
    existingUser.isVerified = false;
    existingUser.rejectionReason = '';
    existingUser.appliedAt = new Date();
    existingUser.decidedAt = undefined;
    existingUser.decidedBy = undefined;
    await existingUser.save();

    // Dispatch notification to active admins
    try {
      const activeAdmins = await User.find({
        role: 'admin',
        isDeactivated: { $ne: true },
        accountStatus: 'active'
      });
      if (activeAdmins.length > 0) {
        const notifications = activeAdmins.map(admin => ({
          userId: admin._id,
          type: 'system',
          title: 'New Professional Application',
          message: `${existingUser.name} has re-applied to become an interviewer.`,
          link: '/admin?tab=requests'
        }));
        await Notification.insertMany(notifications);
      }
    } catch (notifyErr) {
      // Notification failure must never fail signup
    }

    return res.status(200).json({
      success: true,
      message: 'Application resubmitted successfully! Your account is pending administrator approval.',
      data: {
        email: existingUser.email,
        status: 'pending'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Professional registration failed: ' + err.message });
  }
});

// @route   GET /api/users/verify-email/:token
// @desc    Verify user email address via token
// @access  Public
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const hashedToken = User.hashToken(token);
    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Email verification token is invalid or has expired.'
      });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Email address successfully verified! You can now access all platform features.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Verification error: ' + err.message });
  }
});

// @route   POST /api/users/login
// @desc    Authenticate user, issue 15-min JWT access token and 7-day httpOnly refresh cookie
// @access  Public
router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    if (user.isDeactivated || user.accountStatus === 'deactivated') {
      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated by the administrator.'
      });
    }

    if (user.role === 'professional') {
      if (user.accountStatus === 'invited') {
        return res.status(403).json({
          success: false,
          message: 'Your account has been invited but not yet activated. Please open the link sent to your email to set your password.',
          invited: true
        });
      }

      if (user.accountStatus === 'pending' || user.approvalStatus === 'pending') {
        return res.status(403).json({
          success: false,
          message: 'Your professional account is awaiting administrator approval.',
          pendingApproval: true
        });
      }

      if (user.approvalStatus === 'rejected') {
        return res.status(403).json({
          success: false,
          message: `Your professional application was not approved. ${user.rejectionReason ? `Reason: ${user.rejectionReason}` : ''}`,
          rejected: true
        });
      }

      if (!user.isVerified) {
        return res.status(403).json({
          success: false,
          message: 'Your professional account requires administrator verification before logging in.',
          unverified: true
        });
      }
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user, req);
    setRefreshTokenCookie(res, refreshToken);

    res.json({
      success: true,
      message: 'Sign in successful',
      data: {
        token: accessToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          title: user.title,
          isVerified: user.isVerified,
          isEmailVerified: user.isEmailVerified
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Login error: ' + err.message });
  }
});

// @route   POST /api/users/google-login
// @desc    Verify Google ID token with google-auth-library and sign in or create candidate
// @access  Public
router.post('/google-login', authLimiter, validate(googleLoginSchema), async (req, res) => {
  try {
    const { credential } = req.body;
    const clientId = process.env.GOOGLE_CLIENT_ID;

    if (!clientId) {
      return res.status(503).json({
        success: false,
        message: 'Google OAuth is not configured on this server. Please contact support or sign in with email.'
      });
    }

    const client = new OAuth2Client(clientId);
    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: clientId
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      return res.status(401).json({
        success: false,
        message: 'Google authentication verification failed: ' + verifyErr.message
      });
    }

    if (!payload || !payload.email) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Google account payload received.'
      });
    }

    const googleEmail = payload.email.trim().toLowerCase();
    const googleName = payload.name || googleEmail.split('@')[0];
    const googlePicture = payload.picture || '';

    let user = await User.findOne({ email: googleEmail });

    if (!user) {
      // Create new candidate account securely (crypto random password placeholder)
      const randomPassword = crypto.randomBytes(32).toString('hex');
      user = new User({
        name: googleName,
        email: googleEmail,
        password: randomPassword,
        role: 'candidate',
        accountStatus: 'active',
        approvalStatus: 'approved',
        isVerified: false,
        isEmailVerified: true, // Google accounts come pre-verified
        avatar: googlePicture
      });
      await user.save();
    } else {
      if (googlePicture && !user.avatar) {
        user.avatar = googlePicture;
        await user.save();
      }
    }

    if (user.isDeactivated || user.accountStatus === 'deactivated') {
      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated by the administrator.'
      });
    }

    if (user.role === 'professional') {
      if (user.accountStatus === 'invited') {
        return res.status(403).json({
          success: false,
          message: 'Your professional account has been invited. Please accept the email invite first.',
          invited: true
        });
      }
      if (user.approvalStatus === 'pending') {
        return res.status(403).json({
          success: false,
          message: 'Your professional account is currently pending admin approval.',
          pendingApproval: true
        });
      }
      if (user.approvalStatus === 'rejected') {
        return res.status(403).json({
          success: false,
          message: 'Your professional application was not approved.',
          rejected: true
        });
      }
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user, req);
    setRefreshTokenCookie(res, refreshToken);

    res.json({
      success: true,
      message: 'Google authentication successful',
      data: {
        token: accessToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          title: user.title,
          isVerified: user.isVerified,
          isEmailVerified: user.isEmailVerified
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Google sign-in error: ' + err.message });
  }
});

// @route   POST /api/users/refresh
// @desc    Rotate and issue new access token using valid httpOnly refresh token cookie
// @access  Public (Cookie verified)
router.post('/refresh', async (req, res) => {
  try {
    const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!rawRefreshToken) {
      return res.status(401).json({
        success: false,
        message: 'No refresh token provided. Please log in.'
      });
    }

    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const storedToken = await RefreshToken.findOne({
      tokenHash,
      revoked: false,
      expiresAt: { $gt: new Date() }
    });

    if (!storedToken) {
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        success: false,
        message: 'Refresh token is invalid or has been revoked. Please sign in again.'
      });
    }

    // Verify JWT signature
    let decoded;
    try {
      decoded = jwt.verify(rawRefreshToken, JWT_REFRESH_SECRET);
    } catch (jwtErr) {
      await RefreshToken.findByIdAndUpdate(storedToken._id, { revoked: true, revokedAt: new Date() });
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        success: false,
        message: 'Refresh token expired or tampered. Please log in again.'
      });
    }

    const user = await User.findById(decoded.id);
    if (!user || user.isDeactivated || user.accountStatus === 'deactivated') {
      await RefreshToken.findByIdAndUpdate(storedToken._id, { revoked: true, revokedAt: new Date() });
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        success: false,
        message: 'User associated with token no longer valid.'
      });
    }

    // Invalidate the old refresh token (Token Rotation for maximum security)
    await RefreshToken.findByIdAndUpdate(storedToken._id, { revoked: true, revokedAt: new Date() });

    // Issue new tokens
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = await generateRefreshToken(user, req);
    setRefreshTokenCookie(res, newRefreshToken);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token: newAccessToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          title: user.title,
          isVerified: user.isVerified
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Refresh error: ' + err.message });
  }
});

// @route   POST /api/users/logout
// @desc    Revoke refresh token on server and clear cookie
// @access  Public / Authenticated
router.post('/logout', async (req, res) => {
  try {
    const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (rawRefreshToken) {
      const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
      await RefreshToken.updateOne({ tokenHash }, { $set: { revoked: true, revokedAt: new Date() } });
    }

    clearRefreshTokenCookie(res);

    res.json({
      success: true,
      message: 'Logged out successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Logout error: ' + err.message });
  }
});

// @route   POST /api/users/forgot-password
// @desc    Request a password reset email link
// @access  Public
router.post('/forgot-password', passwordResetLimiter, validate(forgotPasswordSchema), async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.trim().toLowerCase() });

    // Consistent timing/message to avoid user enumeration
    if (!user) {
      return res.json({
        success: true,
        message: 'If an account with that email exists, password reset instructions have been sent.'
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = User.hashToken(resetToken);
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const origin = getFrontendBaseUrl();
    await sendPasswordResetEmail({
      name: user.name,
      email: user.email,
      token: resetToken,
      frontendBaseUrl: origin
    });

    res.json({
      success: true,
      message: 'If an account with that email exists, password reset instructions have been sent.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Forgot password error: ' + err.message });
  }
});

// @route   POST /api/users/reset-password
// @desc    Reset password using valid reset token
// @access  Public
router.post('/reset-password', passwordResetLimiter, validate(resetPasswordSchema), async (req, res) => {
  try {
    const { token, password } = req.body;
    const hashedToken = User.hashToken(token);

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Password reset link is invalid or has expired. Please request a new one.'
      });
    }

    // Set new password (pre-save hook hashes with bcrypt)
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Revoke all existing refresh tokens for this user
    await RefreshToken.updateMany({ userId: user._id, revoked: false }, { $set: { revoked: true, revokedAt: new Date() } });

    res.json({
      success: true,
      message: 'Password has been reset successfully! You can now log in with your new password.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Reset password error: ' + err.message });
  }
});

// @route   GET /api/users/invitation/:token
// @desc    Verify invitation token and fetch professional info
// @access  Public
router.get('/invitation/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Invitation token is required.' });
    }

    const hashedToken = User.hashToken(token);
    const user = await User.findOne({
      invitationToken: hashedToken,
      invitationExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'This invitation link is invalid or has expired. Please contact your platform administrator.'
      });
    }

    if (user.isDeactivated || user.accountStatus === 'deactivated') {
      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated.'
      });
    }

    res.json({
      success: true,
      data: {
        valid: true,
        email: user.email,
        name: user.name,
        company: user.company,
        designation: user.designation || user.title,
        experience: user.experience,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error checking invitation: ' + err.message });
  }
});

// @route   POST /api/users/accept-invite
// @desc    The professional opens invitation link and sets password
// @access  Public
router.post('/accept-invite', validate(acceptInviteSchema), async (req, res) => {
  try {
    const { token, password } = req.body;
    const hashedToken = User.hashToken(token);

    const user = await User.findOne({
      invitationToken: hashedToken,
      invitationExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invitation link is invalid or has expired. Please contact the administrator.'
      });
    }

    if (user.isDeactivated || user.accountStatus === 'deactivated') {
      return res.status(403).json({ success: false, message: 'Account is deactivated.' });
    }

    user.password = password;
    user.accountStatus = 'active';
    user.approvalStatus = 'approved';
    user.isVerified = true;
    user.isEmailVerified = true;
    user.isDeactivated = false;
    user.invitationToken = undefined;
    user.invitationExpires = undefined;
    user.acceptedAt = new Date();

    await user.save();

    res.json({
      success: true,
      message: 'Password set successfully! Your Professional account is verified and ready. You can now log in.',
      data: {
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error accepting invitation: ' + err.message });
  }
});

// ==========================================
// PROTECTED ROUTES (Require authenticate)
// ==========================================

// @route   GET /api/users/me
// @desc    Get currently logged in user profile and derived permissions
// @access  Protected
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json({
      success: true,
      data: user
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/users
// @desc    Get users list (candidates get only verified active professionals with public fields; admins get paginated full list)
// @access  Protected
router.get('/', authenticate, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const isAdmin = req.user.role === 'admin';

    if (isAdmin) {
      const filter = {};
      if (req.query.role) filter.role = req.query.role;
      if (req.query.search) {
        const s = req.query.search.trim();
        filter.$or = [
          { name: { $regex: s, $options: 'i' } },
          { email: { $regex: s, $options: 'i' } },
          { company: { $regex: s, $options: 'i' } },
          { title: { $regex: s, $options: 'i' } }
        ];
      }
      const total = await User.countDocuments(filter);
      const users = await User.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      return res.json({
        success: true,
        data: users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1
        }
      });
    }

    // Candidate or professional caller: strictly limited to active, approved, verified professionals
    const filter = {
      role: 'professional',
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: true,
      isDeactivated: { $ne: true }
    };

    if (req.query.search) {
      const s = req.query.search.trim();
      filter.$or = [
        { name: { $regex: s, $options: 'i' } },
        { title: { $regex: s, $options: 'i' } },
        { designation: { $regex: s, $options: 'i' } },
        { company: { $regex: s, $options: 'i' } },
        { skills: { $in: [new RegExp(s, 'i')] } }
      ];
    }

    const total = await User.countDocuments(filter);
    const professionals = await User.find(filter)
      .select(PUBLIC_PROFESSIONAL_FIELDS)
      .sort({ rating: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      data: professionals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/users/:id
// @desc    Get user by ID (Public profile for professionals; full profile only for self or admin)
// @access  Protected
router.get('/:id', authenticate, validateObjectId('id'), async (req, res) => {
  try {
    const { id } = req.params;
    const isSelf = req.user._id.toString() === id;
    const isAdmin = req.user.role === 'admin';

    if (isSelf || isAdmin) {
      const user = await User.findById(id).select('-password');
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      return res.json({ success: true, data: user });
    }

    // Non-admin requesting another user's profile: allowed ONLY if target is an active verified professional
    const professional = await User.findOne({
      _id: id,
      role: 'professional',
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: true,
      isDeactivated: { $ne: true }
    }).select(PUBLIC_PROFESSIONAL_FIELDS);

    if (!professional) {
      return res.status(404).json({
        success: false,
        message: 'Professional profile not found or is currently not active.'
      });
    }

    res.json({ success: true, data: professional });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/users/avatar
// @desc    Upload avatar image via multipart/form-data to Cloudinary (O2)
// @access  Protected
router.post('/avatar', authenticate, (req, res, next) => {
  uploadAvatar.single('avatar')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File size exceeds maximum 2MB limit.' });
      }
      return res.status(err.statusCode || 400).json({ success: false, message: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No avatar image file uploaded.' });
    }

    const secureUrl = await uploadToCloudinary(req.file.buffer, req.user._id);

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { avatar: secureUrl } },
      { new: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Avatar uploaded successfully!',
      avatar: secureUrl,
      user: updatedUser
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Avatar upload failed'
    });
  }
});

// @route   PUT /api/users/:id
// @desc    Update user profile (Enforces ownership: user can only edit self unless admin)
// @access  Protected
router.put('/:id', authenticate, validateObjectId('id'), validate(updateUserSchema), async (req, res) => {
  try {
    const isSelf = req.user._id.toString() === req.params.id;
    const isAdmin = req.user.role === 'admin';

    if (!isSelf && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You can only update your own profile.'
      });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const {
      name,
      title,
      designation,
      company,
      domain,
      bio,
      skills,
      experience,
      linkedin,
      avatar
    } = req.body;

    if (avatar !== undefined) {
      if (typeof avatar !== 'string' || (!avatar.startsWith('https://') && avatar !== '')) {
        return res.status(400).json({
          success: false,
          message: 'Avatar must be a secure HTTPS URL from Cloudinary or an empty string.'
        });
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (title !== undefined) updateData.title = title;
    if (designation !== undefined) {
      updateData.designation = designation;
      if (!updateData.title) updateData.title = designation;
    }
    if (company !== undefined) updateData.company = company;
    if (domain !== undefined) updateData.domain = domain;
    if (bio !== undefined) updateData.bio = bio;
    if (skills !== undefined) updateData.skills = skills;
    if (experience !== undefined) updateData.experience = experience;
    if (linkedin !== undefined) updateData.linkedin = linkedin;
    if (avatar !== undefined) updateData.avatar = avatar;

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/users/:id/earnings
// @desc    Get earnings ledger for professional
// @access  Protected (Active Professional or Admin)
router.get('/:id/earnings', authenticate, validateObjectId('id'), requireRole('professional', 'admin'), async (req, res) => {
  try {
    const isSelf = req.user._id.toString() === req.params.id;
    const isAdmin = req.user.role === 'admin';

    if (!isSelf && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You can only view your own earnings.'
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const interviews = await Interview.find({ interviewerId: req.params.id })
      .populate('candidateId', 'name email avatar')
      .sort({ createdAt: -1 });

    const settings = await Settings.getSettings();
    const interviewerSharePercent = Number(settings.interviewerSharePercent) || 70;
    const minPayoutPaise = settings.minPayoutPaise ?? 30000;

    const completed = interviews.filter(i => i.status === 'completed');
    const eligibleSessions = interviews.filter(i => i.status === 'completed' || i.status === 'candidate_no_show');
    const scheduled = interviews.filter(i => i.status === 'scheduled');
    const cancelled = interviews.filter(i => i.status === 'cancelled');

    const totalEarned = eligibleSessions.reduce((sum, item) => {
      if (item.interviewerEarningsPaise) {
        return sum + (item.interviewerEarningsPaise / 100);
      }
      return sum + Math.round((item.price || 0) * (interviewerSharePercent / 100));
    }, 0);

    const pendingEarnings = scheduled.reduce((sum, item) => {
      if (item.interviewerEarningsPaise) {
        return sum + (item.interviewerEarningsPaise / 100);
      }
      return sum + Math.round((item.price || 0) * (interviewerSharePercent / 100));
    }, 0);

    res.json({
      professional: {
        id: user._id,
        name: user.name,
        isVerified: user.isVerified || false
      },
      stats: {
        totalEarned,
        netPayout: totalEarned,
        pendingEarnings,
        minPayoutPaise,
        minPayout: minPayoutPaise / 100,
        completedSessions: completed.length,
        scheduledSessions: scheduled.length,
        cancelledSessions: cancelled.length,
        totalSessions: interviews.length,
        interviewerSharePercent
      },
      sessions: interviews
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
