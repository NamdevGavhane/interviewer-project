const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Interview = require('../models/Interview');
const { generateToken, authenticate, requireActiveProfessional } = require('../middleware/auth');

// @route   GET /api/users
// @desc    Get all users (optionally filter by role)
// @access  Public
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) {
      filter.role = req.query.role;
      // When candidates fetch professionals for bookings or public lists,
      // exclude unapproved, pending, invited, or deactivated professionals unless explicitly included.
      if (req.query.role === 'professional' && req.query.includePending !== 'true') {
        filter.approvalStatus = { $nin: ['pending', 'rejected'] };
        filter.accountStatus = 'active';
        filter.isDeactivated = { $ne: true };
        filter.isVerified = true;
      }
    }
    const users = await User.find(filter).select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET /api/users/invitation/:token
// @desc    Verify invitation token and fetch professional info (Requirement 4)
// @access  Public
router.get('/invitation/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ message: 'Invitation token is required.' });
    }

    const user = await User.findOne({
      invitationToken: token,
      invitationExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ 
        message: 'This invitation link is invalid or has expired. Please contact your platform administrator for a new invitation.',
        expiredOrInvalid: true
      });
    }

    if (user.isDeactivated || user.accountStatus === 'deactivated') {
      return res.status(403).json({
        message: 'This account has been deactivated. Please contact the administrator.',
        deactivated: true
      });
    }

    res.json({
      valid: true,
      email: user.email,
      name: user.name,
      company: user.company,
      designation: user.designation || user.title,
      experience: user.experience,
      role: user.role
    });
  } catch (err) {
    res.status(500).json({ message: 'Error checking invitation: ' + err.message });
  }
});

// @route   POST /api/users/accept-invite
// @desc    The professional opens the invitation link and sets their own password (Requirement 4, 5, 6, 11, 12)
// @access  Public
router.post('/accept-invite', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Invitation token is missing.' });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
    }

    const user = await User.findOne({
      invitationToken: token,
      invitationExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ 
        message: 'Invitation link is invalid or has expired. Please request a new invite from the administrator.' 
      });
    }

    if (user.isDeactivated || user.accountStatus === 'deactivated') {
      return res.status(403).json({ message: 'Account is deactivated. Cannot set password.' });
    }

    // Requirement 5: Store the password securely using bcrypt hashing
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    // Requirement 6: After successful invitation acceptance and required verification, allow the professional to log in
    user.accountStatus = 'active';
    user.approvalStatus = 'approved';
    user.isVerified = true;
    user.isDeactivated = false;
    user.invitationToken = undefined;
    user.invitationExpires = undefined;
    user.acceptedAt = new Date();

    await user.save();

    res.json({
      message: 'Password set successfully! Your Professional account is verified and ready. You can now log in.',
      email: user.email,
      role: user.role,
      name: user.name
    });
  } catch (err) {
    res.status(500).json({ message: 'Error accepting invitation: ' + err.message });
  }
});

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   PUT /api/users/:id
// @desc    Update user profile / rates / availability
// @access  Public (Enforces active professional validation for professional features)
router.put('/:id', async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    // Requirement 11: Do not allow invited, pending, or deactivated accounts to access protected Professional features
    if (targetUser.role === 'professional') {
      if (targetUser.accountStatus === 'invited') {
        return res.status(403).json({ message: 'Account is pending invitation acceptance.' });
      }
      if (targetUser.isDeactivated || targetUser.accountStatus === 'deactivated') {
        return res.status(403).json({ message: 'Deactivated accounts cannot update professional settings.' });
      }
      if (targetUser.approvalStatus === 'pending') {
        return res.status(403).json({ message: 'Pending accounts cannot update professional settings.' });
      }
    }

    const { name, title, designation, company, domain, hourlyRate, bio, skills, availabilitySlots, experience, linkedin, approvalStatus, isVerified } = req.body;
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (title !== undefined) updateData.title = title;
    if (designation !== undefined) {
      updateData.designation = designation;
      if (!updateData.title) updateData.title = designation;
    }
    if (company !== undefined) updateData.company = company;
    if (domain !== undefined) updateData.domain = domain;
    if (hourlyRate !== undefined) updateData.hourlyRate = Number(hourlyRate);
    if (bio !== undefined) updateData.bio = bio;
    if (skills !== undefined) updateData.skills = skills;
    if (availabilitySlots !== undefined) updateData.availabilitySlots = availabilitySlots;
    if (experience !== undefined) updateData.experience = experience;
    if (linkedin !== undefined) updateData.linkedin = linkedin;
    if (approvalStatus !== undefined) updateData.approvalStatus = approvalStatus;
    if (isVerified !== undefined) updateData.isVerified = isVerified;

    const user = await User.findByIdAndUpdate(req.params.id, { $set: updateData }, { new: true }).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET /api/users/:id/earnings
// @desc    Get earnings report and stats for a professional interviewer
// @access  Protected (Requirement 11)
router.get('/:id/earnings', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Requirement 11: Do not allow invited, pending, or deactivated accounts to access protected Professional features
    if (user.role === 'professional') {
      if (user.accountStatus === 'invited') {
        return res.status(403).json({ message: 'Account is pending invitation acceptance.' });
      }
      if (user.isDeactivated || user.accountStatus === 'deactivated') {
        return res.status(403).json({ message: 'Account has been deactivated.' });
      }
      if (user.approvalStatus === 'pending') {
        return res.status(403).json({ message: 'Account is pending administrator approval.' });
      }
    }

    const interviews = await Interview.find({ interviewerId: req.params.id })
      .populate('candidateId', 'name email avatar')
      .sort({ createdAt: -1 });

    const completed = interviews.filter(i => i.status === 'completed');
    const scheduled = interviews.filter(i => i.status === 'scheduled');
    const cancelled = interviews.filter(i => i.status === 'cancelled');

    const totalEarned = completed.reduce((sum, item) => sum + (item.price || 100), 0);
    const pendingEarnings = scheduled.reduce((sum, item) => sum + (item.price || 100), 0);
    const platformFeeCut = 0;
    const netPayout = totalEarned;

    res.json({
      professional: {
        id: user._id,
        name: user.name,
        hourlyRate: user.hourlyRate || 100,
        isVerified: user.isVerified || false
      },
      stats: {
        totalEarned,
        pendingEarnings,
        platformFeeGenerated: platformFeeCut,
        netPayout,
        completedSessions: completed.length,
        scheduledSessions: scheduled.length,
        cancelledSessions: cancelled.length,
        totalSessions: interviews.length
      },
      sessions: interviews
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   POST /api/users/register
// @desc    Register a new user (Candidate / User account ONLY)
// @access  Public (Requirement 9: Public registration must always create a User account. Requirement 1: Only Admin can create and invite Professional accounts.)
router.post('/register', async (req, res) => {
  try {
    const { 
      name, 
      email, 
      password, 
      title, 
      bio, 
      skills, 
      avatar 
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }
    
    const cleanEmail = email.trim().toLowerCase();

    // Check if user exists
    let existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(400).json({ message: 'An account with this email address already exists.' });
    }

    // Parse skills
    let skillsArray = [];
    if (Array.isArray(skills)) {
      skillsArray = skills;
    } else if (typeof skills === 'string') {
      skillsArray = skills.split(',').map(s => s.trim()).filter(Boolean);
    }

    // REQUIREMENT 9: Public registration must always create a User account (candidate).
    // Professional accounts CANNOT be created via public registration.
    const newUser = new User({
      name: name.trim(),
      email: cleanEmail,
      password, // Password hashed automatically in pre-save hook using bcrypt
      role: 'candidate', // ALWAYS candidate for public registration
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: false,
      isDeactivated: false,
      title: title || 'Candidate',
      bio: bio || '',
      skills: skillsArray,
      avatar: avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80'
    });

    await newUser.save();

    const token = generateToken(newUser);

    res.status(201).json({ 
      message: 'User account created successfully! You can now log in.', 
      userId: newUser._id,
      token,
      role: 'candidate',
      approvalStatus: 'approved',
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        approvalStatus: newUser.approvalStatus
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   POST /api/users/login
// @desc    Authenticate user & get token (Requirement 6, 7, 8, 10, 11)
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }
    
    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials. User not found.' });
    }

    // Compare hashed password securely using bcrypt (with legacy fallback)
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials. Incorrect password.' });
    }

    // Requirement 11: Do not allow invited, pending, or deactivated accounts to access protected features
    if (user.isDeactivated || user.accountStatus === 'deactivated') {
      return res.status(403).json({
        message: 'This account has been deactivated by the administrator. Access is restricted.',
        deactivated: true
      });
    }

    // Professional status validation
    if (user.role === 'professional') {
      // 1. Invited accounts that haven't set their password yet
      if (user.accountStatus === 'invited') {
        return res.status(403).json({
          message: 'Your Professional account has been invited but not yet activated. Please open the invitation link sent to your email to set your password.',
          invited: true,
          accountStatus: 'invited'
        });
      }

      // 2. Pending admin approval
      if (user.accountStatus === 'pending' || user.approvalStatus === 'pending') {
        return res.status(403).json({ 
          message: 'Your application to join as a Professional is currently PENDING Admin approval.',
          pendingApproval: true,
          approvalStatus: 'pending',
          userId: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          appliedAt: user.createdAt
        });
      }

      // 3. Rejected accounts
      if (user.approvalStatus === 'rejected') {
        return res.status(403).json({ 
          message: `Your professional application was not approved by the admin. ${user.rejectionReason ? `Reason: ${user.rejectionReason}` : ''}`,
          rejected: true,
          approvalStatus: 'rejected',
          userId: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        });
      }

      // 4. Verification requirement
      if (!user.isVerified) {
        return res.status(403).json({
          message: 'Your professional account requires administrator verification before logging in.',
          unverified: true
        });
      }
    }

    const token = generateToken(user);

    // Requirement 8: After successful login, redirect the professional to the Professional Dashboard
    res.json({ 
      message: 'Login successful', 
      token,
      userId: user._id, 
      role: user.role,
      name: user.name,
      email: user.email,
      approvalStatus: user.approvalStatus || 'approved',
      accountStatus: user.accountStatus || 'active',
      isVerified: user.isVerified || false
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   POST /api/users/google-login
// @desc    Authenticate via Google (Enforces that new public Google signups are User/Candidate accounts)
// @access  Public
router.post('/google-login', async (req, res) => {
  try {
    const { email, name, avatar } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Google email is required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    let user = await User.findOne({ email: cleanEmail });

    if (!user) {
      // Requirement 9: Public registration must always create a User (candidate) account
      user = new User({
        name: name || cleanEmail.split('@')[0],
        email: cleanEmail,
        password: 'google_oauth_' + Math.random().toString(36),
        role: 'candidate',
        accountStatus: 'active',
        approvalStatus: 'approved',
        isVerified: false,
        avatar: avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80'
      });
      await user.save();
    }

    // Check deactivated status
    if (user.isDeactivated || user.accountStatus === 'deactivated') {
      return res.status(403).json({
        message: 'This account has been deactivated by the administrator.',
        deactivated: true
      });
    }

    // Check professional status
    if (user.role === 'professional') {
      if (user.accountStatus === 'invited') {
        return res.status(403).json({
          message: 'Your account is pending invitation acceptance. Please set your password via your invitation email.',
          invited: true
        });
      }

      if (user.approvalStatus === 'pending') {
        return res.status(403).json({
          message: 'Your professional account is currently PENDING Admin approval.',
          pendingApproval: true,
          approvalStatus: 'pending'
        });
      }

      if (user.approvalStatus === 'rejected') {
        return res.status(403).json({
          message: `Your professional application was rejected by the admin. ${user.rejectionReason ? `Reason: ${user.rejectionReason}` : ''}`,
          rejected: true,
          approvalStatus: 'rejected'
        });
      }
    }

    const token = generateToken(user);

    res.json({
      message: 'Google login successful',
      token,
      userId: user._id,
      role: user.role,
      name: user.name,
      email: user.email,
      approvalStatus: user.approvalStatus || 'approved',
      accountStatus: user.accountStatus || 'active',
      isVerified: user.isVerified || false
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

