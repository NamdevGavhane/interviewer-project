const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const Interview = require('../models/Interview');
const Payment = require('../models/Payment');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendProfessionalInvitationEmail } = require('../utils/mailer');

// @route   POST /api/admin/invite-professional
// @desc    Admin creates and invites a Professional account (sends email with secure link, NEVER sending password)
// @access  Admin only (Requirement 1, 2, 3, 12)
router.post('/invite-professional', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { name, email, company, designation, experience, domain, hourlyRate } = req.body;

    // Requirement 2: Admin enters the professional's name, email, company, designation, and experience
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Professional's full name is required." });
    }
    if (!email || !email.trim() || !email.includes('@')) {
      return res.status(400).json({ message: "A valid professional email address is required." });
    }
    if (!company || !company.trim()) {
      return res.status(400).json({ message: "Company name is required." });
    }
    if (!designation || !designation.trim()) {
      return res.status(400).json({ message: "Designation / Job Title is required." });
    }
    if (!experience || !experience.trim()) {
      return res.status(400).json({ message: "Professional experience is required." });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if user already exists
    let existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      if (existingUser.accountStatus === 'invited' && !existingUser.password) {
        // Already invited but has not yet accepted / set password -> regenerate token and re-invite
        const token = crypto.randomBytes(32).toString('hex');
        existingUser.name = name.trim();
        existingUser.company = company.trim();
        existingUser.designation = designation.trim();
        existingUser.title = designation.trim();
        existingUser.experience = experience.trim();
        existingUser.invitationToken = token;
        existingUser.invitationExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        existingUser.invitedAt = new Date();
        existingUser.invitedBy = req.user._id;
        await existingUser.save();

        const mailResult = await sendProfessionalInvitationEmail({
          name: existingUser.name,
          email: existingUser.email,
          company: existingUser.company,
          designation: existingUser.designation,
          experience: existingUser.experience,
          token,
          frontendBaseUrl: req.headers.origin || 'http://localhost:5173'
        });

        return res.status(200).json({
          message: `Re-sent invitation email to ${cleanEmail}. The professional must open the link to set their own password.`,
          invitationLink: mailResult.invitationLink,
          user: {
            id: existingUser._id,
            name: existingUser.name,
            email: existingUser.email,
            company: existingUser.company,
            designation: existingUser.designation,
            experience: existingUser.experience,
            accountStatus: existingUser.accountStatus,
            approvalStatus: existingUser.approvalStatus,
            isVerified: existingUser.isVerified
          }
        });
      }

      return res.status(400).json({ 
        message: `An account with email "${cleanEmail}" already exists (Role: ${existingUser.role}, Status: ${existingUser.accountStatus || existingUser.approvalStatus}).` 
      });
    }

    // Generate secure invitation token (crypto random 32 bytes)
    const token = crypto.randomBytes(32).toString('hex');

    // Create new Professional account in 'invited' state
    // Requirement 12: Never send passwords through email. Password is NOT generated or sent!
    const newProfessional = new User({
      name: name.trim(),
      email: cleanEmail,
      company: company.trim(),
      designation: designation.trim(),
      title: designation.trim(),
      experience: experience.trim(),
      domain: domain ? domain.trim() : 'Software Engineering',
      hourlyRate: Number(hourlyRate) || 100,
      role: 'professional',
      accountStatus: 'invited', // Must accept invite and set password to activate
      approvalStatus: 'approved', // Pre-approved because invited directly by Admin
      isVerified: true, // Verification pre-granted by Admin
      isDeactivated: false,
      invitationToken: token,
      invitationExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      invitedBy: req.user._id,
      invitedAt: new Date(),
      availabilitySlots: ['10:00 AM - 10:45 AM', '02:00 PM - 02:45 PM', '05:00 PM - 05:45 PM', '07:00 PM - 07:45 PM'],
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80'
    });

    await newProfessional.save();

    // Requirement 3: Send an invitation email to the professional
    const mailResult = await sendProfessionalInvitationEmail({
      name: newProfessional.name,
      email: newProfessional.email,
      company: newProfessional.company,
      designation: newProfessional.designation,
      experience: newProfessional.experience,
      token,
      frontendBaseUrl: req.headers.origin || 'http://localhost:5173'
    });

    res.status(201).json({
      message: `Invitation successfully sent to ${cleanEmail}! The professional will set their own password via the email link.`,
      invitationLink: mailResult.invitationLink,
      user: {
        id: newProfessional._id,
        name: newProfessional.name,
        email: newProfessional.email,
        company: newProfessional.company,
        designation: newProfessional.designation,
        experience: newProfessional.experience,
        accountStatus: newProfessional.accountStatus,
        approvalStatus: newProfessional.approvalStatus,
        isVerified: newProfessional.isVerified,
        invitedAt: newProfessional.invitedAt
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error inviting professional: ' + err.message });
  }
});

// @route   GET /api/admin/invitations
// @desc    Get all invited professionals with their invitation status
// @access  Admin only
router.get('/invitations', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const invitations = await User.find({
      role: 'professional',
      $or: [
        { accountStatus: 'invited' },
        { invitationToken: { $exists: true, $ne: null } },
        { acceptedAt: { $exists: true, $ne: null } }
      ]
    })
    .select('-password')
    .sort({ createdAt: -1 });

    res.json(invitations);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   POST /api/admin/invitations/:id/resend
// @desc    Resend invitation email with a fresh token
// @access  Admin only
router.post('/invitations/:id/resend', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.role !== 'professional') {
      return res.status(400).json({ message: 'User is not a professional' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    user.invitationToken = token;
    user.invitationExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    user.accountStatus = 'invited';
    user.invitedAt = new Date();
    user.invitedBy = req.user._id;
    await user.save();

    const mailResult = await sendProfessionalInvitationEmail({
      name: user.name,
      email: user.email,
      company: user.company,
      designation: user.designation || user.title,
      experience: user.experience,
      token,
      frontendBaseUrl: req.headers.origin || 'http://localhost:5173'
    });

    res.json({
      message: `Fresh invitation email dispatched to ${user.email}`,
      invitationLink: mailResult.invitationLink,
      user
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   PATCH /api/admin/users/:id/toggle-status
// @desc    Admin deactivates or reactivates an account (Requirement 11)
// @access  Admin only
router.patch('/users/:id/toggle-status', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Cannot deactivate an admin account' });
    }

    const isCurrentlyDeactivated = user.isDeactivated || user.accountStatus === 'deactivated';
    const newDeactivatedState = !isCurrentlyDeactivated;

    user.isDeactivated = newDeactivatedState;
    if (newDeactivatedState) {
      user.accountStatus = 'deactivated';
    } else {
      // Revert to active if password is set, else invited
      user.accountStatus = user.password ? 'active' : 'invited';
    }

    await user.save();

    res.json({
      message: `Account for ${user.name} is now ${newDeactivatedState ? 'Deactivated 🔴' : 'Active 🟢'}`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isDeactivated: user.isDeactivated,
        accountStatus: user.accountStatus
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET /api/admin/stats
// @desc    Get overall admin dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const candidatesCount = await User.countDocuments({ role: 'candidate' });
    const professionalsCount = await User.countDocuments({ role: 'professional' });
    const verifiedProfessionalsCount = await User.countDocuments({ role: 'professional', isVerified: true });
    const invitedProfessionalsCount = await User.countDocuments({ role: 'professional', accountStatus: 'invited' });
    const deactivatedCount = await User.countDocuments({ 
      $or: [{ isDeactivated: true }, { accountStatus: 'deactivated' }] 
    });
    
    // Professional approval request metrics
    const pendingRequestsCount = await User.countDocuments({ 
      $or: [
        { role: 'professional', approvalStatus: 'pending' },
        { approvalStatus: 'pending' }
      ]
    });
    const approvedProfessionalsCount = await User.countDocuments({ role: 'professional', approvalStatus: 'approved' });
    const rejectedRequestsCount = await User.countDocuments({ approvalStatus: 'rejected' });

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
      invitedProfessionalsCount,
      deactivatedCount,
      pendingRequestsCount,
      approvedProfessionalsCount,
      rejectedRequestsCount,
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

// @route   GET /api/admin/requests
// @desc    Get all professional application requests
router.get('/requests', async (req, res) => {
  try {
    const { status } = req.query;
    let query = {
      $or: [
        { role: 'professional' },
        { approvalStatus: 'pending' },
        { approvalStatus: 'rejected' }
      ]
    };

    if (status && status !== 'all') {
      query.approvalStatus = status;
    }

    const requests = await User.find(query).select('-password').sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   PATCH /api/admin/requests/:id/decision
// @desc    Admin decision: approve as professional, make candidate, or reject
router.patch('/requests/:id/decision', async (req, res) => {
  try {
    const { decision, rejectionReason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User request not found' });

    if (decision === 'approve') {
      user.role = 'professional';
      user.approvalStatus = 'approved';
      user.accountStatus = user.password ? 'active' : 'invited';
      user.isVerified = true;
      user.rejectionReason = '';
      await user.save();
      return res.json({ 
        message: `Approved ${user.name} as a Professional Interviewer! Verification granted.`, 
        user 
      });
    } else if (decision === 'make_candidate') {
      user.role = 'candidate';
      user.approvalStatus = 'approved';
      user.accountStatus = 'active';
      user.isVerified = false;
      user.rejectionReason = '';
      await user.save();
      return res.json({ 
        message: `Decision recorded: ${user.name} has been set to Candidate (Regular User).`, 
        user 
      });
    } else if (decision === 'reject') {
      user.approvalStatus = 'rejected';
      user.isVerified = false;
      user.rejectionReason = rejectionReason || 'Application criteria not met';
      await user.save();
      return res.json({ 
        message: `Application for ${user.name} has been rejected.`, 
        user 
      });
    } else {
      return res.status(400).json({ message: 'Invalid decision. Use "approve", "make_candidate", or "reject".' });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users with search and role filter
router.get('/users', async (req, res) => {
  try {
    const { role, search, approvalStatus, accountStatus } = req.query;
    let query = {};

    if (role && role !== 'all') {
      query.role = role;
    }

    if (approvalStatus && approvalStatus !== 'all') {
      query.approvalStatus = approvalStatus;
    }

    if (accountStatus && accountStatus !== 'all') {
      query.accountStatus = accountStatus;
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

