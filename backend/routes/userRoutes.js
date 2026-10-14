const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Interview = require('../models/Interview');

// @route   GET /api/users
// @desc    Get all users (optionally filter by role)
// @access  Public
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) {
      filter.role = req.query.role;
    }
    const users = await User.find(filter).select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
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
// @access  Public
router.put('/:id', async (req, res) => {
  try {
    const { name, title, company, hourlyRate, bio, skills, availabilitySlots } = req.body;
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (title !== undefined) updateData.title = title;
    if (company !== undefined) updateData.company = company;
    if (hourlyRate !== undefined) updateData.hourlyRate = Number(hourlyRate);
    if (bio !== undefined) updateData.bio = bio;
    if (skills !== undefined) updateData.skills = skills;
    if (availabilitySlots !== undefined) updateData.availabilitySlots = availabilitySlots;

    const user = await User.findByIdAndUpdate(req.params.id, { $set: updateData }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET /api/users/:id/earnings
// @desc    Get earnings report and stats for a professional interviewer
// @access  Public
router.get('/:id/earnings', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const interviews = await Interview.find({ interviewerId: req.params.id })
      .populate('candidateId', 'name email avatar')
      .sort({ createdAt: -1 });

    const completed = interviews.filter(i => i.status === 'completed');
    const scheduled = interviews.filter(i => i.status === 'scheduled');
    const cancelled = interviews.filter(i => i.status === 'cancelled');

    const totalEarned = completed.reduce((sum, item) => sum + (item.price || 100), 0);
    const pendingEarnings = scheduled.reduce((sum, item) => sum + (item.price || 100), 0);
    const platformFeeCut = Math.round(totalEarned * 0.1);
    const netPayout = totalEarned; // Professional gets the full session fee, candidate pays extra platform fee

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
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    user = new User({
      name,
      email,
      password, // In a real app, hash this password with bcrypt!
      role
    });

    await user.save();
    res.status(201).json({ message: 'User registered successfully', userId: user._id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   POST /api/users/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // In a real app, compare hashed password using bcrypt.compare()
    if (user.password !== password) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // In a real app, return a JWT token here
    res.json({ message: 'Login successful', userId: user._id, role: user.role });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   POST /api/users/google-login
// @desc    Authenticate or register user via Google
// @access  Public
router.post('/google-login', async (req, res) => {
  try {
    const { email, name, avatar, role } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Google email is required' });
    }

    let user = await User.findOne({ email });
    if (!user) {
      // Auto-register new user from Google
      user = new User({
        name: name || email.split('@')[0],
        email,
        password: 'google_oauth_' + Math.random().toString(36),
        role: role || 'candidate',
        avatar: avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80'
      });
      await user.save();
    }

    res.json({
      message: 'Google login successful',
      userId: user._id,
      role: user.role,
      name: user.name,
      email: user.email
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
