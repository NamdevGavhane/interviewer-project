const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const Interview = require('../models/Interview');
const Payment = require('../models/Payment');
const Payout = require('../models/Payout');
const Notification = require('../models/Notification');
const { authenticate, requireRole } = require('../middleware/auth');
const {
  sendProfessionalInvitationEmail,
  sendPayoutProcessedEmail,
  sendProfessionalDecisionEmail
} = require('../utils/mailer');
const { validate } = require('../middleware/validate');
const { validateObjectId } = require('../middleware/validateObjectId');
const { getFrontendBaseUrl } = require('../utils/urlHelper');
const { getPagination } = require('../utils/pagination');
const { inviteProfessionalSchema, requestDecisionSchema } = require('../validators/schemas');

// Enforce Admin Authentication on ALL admin routes
router.use(authenticate, requireRole('admin'));

// @route   POST /api/admin/invite-professional
// @desc    Admin creates and invites a Professional account
router.post('/invite-professional', validate(inviteProfessionalSchema), async (req, res) => {
  try {
    const { name, email, company, designation, experience, domain } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    let existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      if (existingUser.accountStatus === 'invited' && !existingUser.password) {
        const token = crypto.randomBytes(32).toString('hex');
        existingUser.name = name.trim();
        existingUser.company = company.trim();
        existingUser.designation = designation.trim();
        existingUser.title = designation.trim();
        existingUser.experience = experience.trim();
        existingUser.invitationToken = User.hashToken(token);
        existingUser.invitationExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        existingUser.invitedAt = new Date();
        existingUser.invitedBy = req.user._id;
        await existingUser.save();

        const frontendBaseUrl = getFrontendBaseUrl();
        const invitationLink = `${frontendBaseUrl.replace(/\/+$/, '')}/accept-invite?token=${encodeURIComponent(token)}`;

        let mailResult = { sent: false };
        try {
          mailResult = await sendProfessionalInvitationEmail({
            name: existingUser.name,
            email: existingUser.email,
            company: existingUser.company,
            designation: existingUser.designation,
            experience: existingUser.experience,
            token,
            frontendBaseUrl
          });
        } catch (mailErr) {
          console.warn('[ADMIN RE-INVITE] Email dispatch skipped (SMTP unconfigured or blocked):', mailErr.message);
          mailResult = { sent: false, error: mailErr.message };
        }

        return res.status(200).json({
          success: true,
          message: mailResult && mailResult.sent
            ? `Re-sent invitation email to ${cleanEmail}.`
            : `Invitation refreshed for ${cleanEmail}!`,
          data: {
            user: existingUser,
            mailSent: !!(mailResult && mailResult.sent)
          }
        });
      }

      return res.status(400).json({
        success: false,
        message: `An account with email "${cleanEmail}" already exists (Role: ${existingUser.role}).`
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const newProfessional = new User({
      name: name.trim(),
      email: cleanEmail,
      company: company.trim(),
      designation: designation.trim(),
      title: designation.trim(),
      experience: experience.trim(),
      domain: domain ? domain.trim() : 'Software Engineering',
      role: 'professional',
      accountStatus: 'invited',
      approvalStatus: 'approved',
      isVerified: true,
      isDeactivated: false,
      invitationToken: User.hashToken(token),
      invitationExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      invitedBy: req.user._id,
      invitedAt: new Date(),
      availabilitySlots: []
    });

    await newProfessional.save();

    const frontendBaseUrl = getFrontendBaseUrl();
    const invitationLink = `${frontendBaseUrl.replace(/\/+$/, '')}/accept-invite?token=${encodeURIComponent(token)}`;

    let mailResult = { sent: false };
    try {
      mailResult = await sendProfessionalInvitationEmail({
        name: newProfessional.name,
        email: newProfessional.email,
        company: newProfessional.company,
        designation: newProfessional.designation,
        experience: newProfessional.experience,
        token,
        frontendBaseUrl
      });
    } catch (mailErr) {
      console.warn('[ADMIN INVITE] Email dispatch skipped (SMTP unconfigured or blocked):', mailErr.message);
      mailResult = { sent: false, error: mailErr.message };
    }

    res.status(201).json({
      success: true,
      message: mailResult && mailResult.sent 
        ? `Official invitation email successfully delivered to ${cleanEmail}.`
        : `Invitation created for ${cleanEmail}!`,
      data: {
        user: newProfessional,
        mailSent: !!(mailResult && mailResult.sent)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error inviting professional: ' + err.message });
  }
});

// @route   GET /api/admin/invitations
// @desc    Get all invited professionals with their invitation status
router.get('/invitations', async (req, res) => {
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
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/admin/invitations/:id/resend
// @desc    Resend invitation email with a fresh token
router.post('/invitations/:id/resend', validateObjectId('id'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.role !== 'professional') {
      return res.status(400).json({ success: false, message: 'User is not a professional' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    user.invitationToken = User.hashToken(token);
    user.invitationExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    user.accountStatus = 'invited';
    user.invitedAt = new Date();
    user.invitedBy = req.user._id;
    await user.save();

    const frontendBaseUrl = getFrontendBaseUrl();
    const invitationLink = `${frontendBaseUrl.replace(/\/+$/, '')}/accept-invite?token=${encodeURIComponent(token)}`;

    let mailResult = { sent: false };
    try {
      mailResult = await sendProfessionalInvitationEmail({
        name: user.name,
        email: user.email,
        company: user.company,
        designation: user.designation || user.title,
        experience: user.experience,
        token,
        frontendBaseUrl
      });
    } catch (mailErr) {
      console.warn('[ADMIN RESEND] Email dispatch skipped (SMTP unconfigured or blocked):', mailErr.message);
      mailResult = { sent: false, error: mailErr.message };
    }

    res.json({
      success: true,
      message: mailResult && mailResult.sent 
        ? `Fresh invitation email dispatched to ${user.email}`
        : `Fresh invitation created for ${user.email}.`,
      data: { user, mailSent: !!(mailResult && mailResult.sent) }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/admin/users/:id/toggle-status
// @desc    Admin deactivates or reactivates an account
router.patch('/users/:id/toggle-status', validateObjectId('id'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.role === 'admin') {
      return res.status(400).json({ success: false, message: 'Cannot deactivate an admin account' });
    }

    const isCurrentlyDeactivated = user.isDeactivated || user.accountStatus === 'deactivated';
    const newDeactivatedState = !isCurrentlyDeactivated;

    user.isDeactivated = newDeactivatedState;
    if (newDeactivatedState) {
      user.accountStatus = 'deactivated';
    } else {
      user.accountStatus = user.password ? 'active' : 'invited';
    }

    await user.save();

    res.json({
      success: true,
      message: `Account for ${user.name} is now ${newDeactivatedState ? 'Deactivated' : 'Active'}`,
      data: user
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/admin/stats
// @desc    Get aggregated dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const [
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
      paymentStats
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'candidate' }),
      User.countDocuments({ role: 'professional' }),
      User.countDocuments({ role: 'professional', isVerified: true }),
      User.countDocuments({ role: 'professional', accountStatus: 'invited' }),
      User.countDocuments({ $or: [{ isDeactivated: true }, { accountStatus: 'deactivated' }] }),
      User.countDocuments({ $or: [{ role: 'professional', approvalStatus: 'pending' }, { approvalStatus: 'pending' }] }),
      User.countDocuments({ role: 'professional', approvalStatus: 'approved' }),
      User.countDocuments({ approvalStatus: 'rejected' }),
      Interview.countDocuments(),
      Interview.countDocuments({ status: 'completed' }),
      Interview.countDocuments({ status: 'scheduled' }),
      Interview.countDocuments({ status: 'cancelled' }),
      Payment.aggregate([
        {
          $group: {
            _id: null,
            totalVolume: { $sum: '$amount' },
            platformRevenue: { $sum: '$platformFee' }
          }
        }
      ])
    ]);

    const totalVolume = paymentStats[0]?.totalVolume || 0;
    const platformRevenue = paymentStats[0]?.platformRevenue || 0;

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
    res.status(500).json({ success: false, message: err.message });
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

    const { page, limit, skip, formatMeta } = getPagination(req.query, 20);

    const [total, requests] = await Promise.all([
      User.countDocuments(query),
      User.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
    ]);

    res.json({
      success: true,
      data: requests,
      pagination: formatMeta(total)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/admin/requests/:id/decision
// @desc    Admin decision: approve, reject, or make candidate
router.patch('/requests/:id/decision', validateObjectId('id'), validate(requestDecisionSchema), async (req, res) => {
  try {
    const { decision, rejectionReason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User request not found' });

    // Set decision audit fields for all decisions
    user.decidedBy = req.user._id;
    user.decidedAt = new Date();

    const rawFrontendUrl = process.env.FRONTEND_URL || '';
    const frontendBaseUrl = rawFrontendUrl.split(',')[0].trim() || getFrontendBaseUrl();

    if (decision === 'approve') {
      user.role = 'professional';
      user.approvalStatus = 'approved';
      user.accountStatus = user.password ? 'active' : 'invited';
      user.isVerified = true;
      user.rejectionReason = '';
      await user.save();

      let mailSent = false;
      try {
        const mailResult = await sendProfessionalDecisionEmail({
          name: user.name,
          email: user.email,
          approved: true,
          reason: '',
          frontendBaseUrl
        });
        mailSent = Boolean(mailResult && mailResult.sent);
      } catch (mailErr) {
        mailSent = false;
      }

      return res.json({
        success: true,
        message: `Approved ${user.name} as a Professional Interviewer.`,
        user,
        mailSent
      });
    } else if (decision === 'make_candidate') {
      user.role = 'candidate';
      user.approvalStatus = 'approved';
      user.accountStatus = 'active';
      user.isVerified = false;
      user.rejectionReason = '';
      await user.save();

      return res.json({
        success: true,
        message: `Converted ${user.name} to Candidate account.`,
        user
      });
    } else if (decision === 'reject') {
      user.approvalStatus = 'rejected';
      user.isVerified = false;
      user.rejectionReason = rejectionReason || 'Application criteria not met at this time.';
      await user.save();

      // Revoke all non-revoked refresh tokens immediately
      await RefreshToken.updateMany(
        { userId: user._id, revoked: false },
        { $set: { revoked: true, revokedAt: new Date() } }
      );

      let mailSent = false;
      try {
        const mailResult = await sendProfessionalDecisionEmail({
          name: user.name,
          email: user.email,
          approved: false,
          reason: user.rejectionReason,
          frontendBaseUrl
        });
        mailSent = Boolean(mailResult && mailResult.sent);
      } catch (mailErr) {
        mailSent = false;
      }

      return res.json({
        success: true,
        message: `Application rejected for ${user.name}.`,
        user,
        mailSent
      });
    }

    res.status(400).json({ success: false, message: 'Invalid decision action.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users with server-side filtering
router.get('/users', async (req, res) => {
  try {
    const { role, search, status } = req.query;
    let query = {};

    if (role && role !== 'all') {
      query.role = role;
    }

    if (status && status !== 'all') {
      if (status === 'deactivated') {
        query.$or = [{ isDeactivated: true }, { accountStatus: 'deactivated' }];
      } else if (status === 'active') {
        query.accountStatus = 'active';
        query.isDeactivated = { $ne: true };
      } else if (status === 'invited') {
        query.accountStatus = 'invited';
      } else if (status === 'pending') {
        query.approvalStatus = 'pending';
      }
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ name: regex }, { email: regex }, { company: regex }, { title: regex }];
    }

    const { page, limit, skip, formatMeta } = getPagination(req.query, 20);

    const [total, users] = await Promise.all([
      User.countDocuments(query),
      User.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
    ]);

    res.json({
      success: true,
      data: users,
      pagination: formatMeta(total)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/admin/users/:id/role
// @desc    Change user role
router.patch('/users/:id/role', validateObjectId('id'), async (req, res) => {
  try {
    const { role } = req.body;
    if (!['candidate', 'professional', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role specified' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.role = role;
    if (role === 'professional') {
      user.approvalStatus = 'approved';
      user.isVerified = true;
    }
    await user.save();

    res.json({
      success: true,
      message: `Role updated to ${role} for ${user.name}`,
      user
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/admin/users/:id/verify
// @desc    Toggle user verified status
router.patch('/users/:id/verify', validateObjectId('id'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.isVerified = !user.isVerified;
    await user.save();

    res.json({
      success: true,
      message: `User is now ${user.isVerified ? 'Verified' : 'Unverified'}`,
      user
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/admin/users/:id
// @desc    Delete user account and cascade cleanups
router.delete('/users/:id', validateObjectId('id'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.role === 'admin') {
      return res.status(400).json({ success: false, message: 'Cannot delete an administrator account' });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({
      success: true,
      message: `Account for ${user.name} has been permanently deleted.`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/admin/bookings
// @desc    Get all bookings
router.get('/bookings', async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = {};

    const { page, limit, skip, formatMeta } = getPagination(req.query, 20);

    const [total, bookings] = await Promise.all([
      Interview.countDocuments(query),
      Interview.find(query)
        .populate('candidateId', 'name email avatar')
        .populate('interviewerId', 'name email avatar title company')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
    ]);

    res.json({
      success: true,
      data: bookings,
      pagination: formatMeta(total)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/admin/bookings/:id
// @desc    Delete or cancel booking
router.delete('/bookings/:id', validateObjectId('id'), async (req, res) => {
  try {
    const booking = await Interview.findByIdAndDelete(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    res.json({
      success: true,
      message: 'Interview booking record deleted successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/admin/payouts
// @desc    List all payout requests with status filter
router.get('/payouts', async (req, res) => {
  try {
    const { status } = req.query;
    let query = {};
    const { page, limit, skip, formatMeta } = getPagination(req.query, 20);

    const [total, payouts] = await Promise.all([
      Payout.countDocuments(query),
      Payout.find(query)
        .populate('interviewerId', 'name email title company')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
    ]);

    res.json({
      success: true,
      data: payouts,
      pagination: formatMeta(total)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/admin/payouts/:id/status
// @desc    Approve, process, complete, or reject a payout request
router.put('/payouts/:id/status', validateObjectId('id'), async (req, res) => {
  try {
    const { status, referenceId, notes } = req.body;
    if (!['pending', 'processing', 'completed', 'rejected', 'failed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid payout status value.' });
    }

    const payout = await Payout.findById(req.params.id);
    if (!payout) {
      return res.status(404).json({ success: false, message: 'Payout request not found.' });
    }

    payout.status = status;
    if (referenceId) payout.referenceId = referenceId;
    if (notes) payout.notes = notes;
    if (status === 'completed' || status === 'processing') {
      payout.processedAt = new Date();
    }

    await payout.save();

    const populated = await Payout.findById(payout._id)
      .populate('interviewerId', 'name email title company');

    // Notify professional of payout status update (O1, O6)
    try {
      if (populated.interviewerId) {
        await Notification.create({
          userId: populated.interviewerId._id,
          type: 'payout_processed',
          title: `Payout Request ${status.toUpperCase()}`,
          message: `Your withdrawal of ₹${payout.amount} has been updated to: ${status.toUpperCase()}.${referenceId ? ` Reference: ${referenceId}` : ''}`,
          link: '/earnings'
        });

        const frontendBaseUrl = getFrontendBaseUrl();
        await sendPayoutProcessedEmail({
          professionalName: populated.interviewerId.name,
          professionalEmail: populated.interviewerId.email,
          amount: payout.amount,
          status,
          referenceId: payout.referenceId || '',
          frontendBaseUrl
        });
      }
    } catch (alertErr) {
      console.warn('Payout status alert notice:', alertErr.message);
    }

    res.json({
      success: true,
      message: `Payout request updated to ${status}.`,
      payout: populated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
