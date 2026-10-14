const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Interview = require('../models/Interview');
const Payment = require('../models/Payment');

// @route   GET /api/admin/stats
// @desc    Get overall admin dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const candidatesCount = await User.countDocuments({ role: 'candidate' });
    const professionalsCount = await User.countDocuments({ role: 'professional' });
    const verifiedProfessionalsCount = await User.countDocuments({ role: 'professional', isVerified: true });
    
    const totalBookings = await Interview.countDocuments();
    const completedBookings = await Interview.countDocuments({ status: 'completed' });
    const scheduledBookings = await Interview.countDocuments({ status: 'scheduled' });
    const cancelledBookings = await Interview.countDocuments({ status: 'cancelled' });

    const payments = await Payment.find();
    const totalVolume = payments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const platformRevenue = payments.reduce((acc, p) => acc + (p.platformFee || 0), 0);

    res.json({
      totalUsers,
      candidatesCount,
      professionalsCount,
      verifiedProfessionalsCount,
      totalBookings,
      completedBookings,
      scheduledBookings,
      cancelledBookings,
      totalVolume,
      platformRevenue
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users with search and role filter
router.get('/users', async (req, res) => {
  try {
    const { role, search } = req.query;
    let query = {};

    if (role && role !== 'all') {
      query.role = role;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   PATCH /api/admin/users/:id/role
// @desc    Update user role (candidate, professional, admin)
router.patch('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['candidate', 'professional', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role provided' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { role } },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: `Role updated to ${role}`, user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   PATCH /api/admin/users/:id/verify
// @desc    Toggle verified status of a professional interviewer
router.patch('/users/:id/verify', async (req, res) => {
  try {
    const { isVerified } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isVerified: Boolean(isVerified) } },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ 
      message: `Professional is now ${user.isVerified ? 'Verified' : 'Unverified'}`,
      user 
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   DELETE /api/admin/users/:id
// @desc    Delete a user
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET /api/admin/bookings
// @desc    Get all interview bookings across the platform
router.get('/bookings', async (req, res) => {
  try {
    const { status } = req.query;
    let query = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    const bookings = await Interview.find(query)
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email avatar title company isVerified')
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   PATCH /api/admin/bookings/:id/status
// @desc    Admin override booking status (scheduled / completed / cancelled)
router.patch('/bookings/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['scheduled', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const booking = await Interview.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    )
    .populate('candidateId', 'name email')
    .populate('interviewerId', 'name email');

    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json({ message: `Booking status updated to ${status}`, booking });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
