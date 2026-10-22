const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const InterviewConfig = require('../models/InterviewConfig');
const { authenticate, requireRole } = require('../middleware/auth');

// @route   GET /api/settings
// @desc    Get platform settings
// @access  Public / Authenticated
router.get('/', async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.json({
      success: true,
      data: settings
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/settings
// @desc    Update platform settings with input validation (M1, M2)
// @access  Admin only
router.put('/', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const {
      mockSessionPricePaise,
      interviewerSharePercent,
      minPayoutPaise,
      pendingPaymentMinutes,
      joinOpensMinutesBefore,
      joinGraceMinutesAfter,
      noShowWaitMinutes,
      payoutHoldDays,
      platformCommissionPercent,
      gstPercent,
      refundWindowHours,
      supportEmail,
      siteName
    } = req.body;

    const updateData = {};

    if (mockSessionPricePaise !== undefined) {
      const price = Number(mockSessionPricePaise);
      if (isNaN(price) || price < 0) {
        return res.status(400).json({ success: false, message: 'mockSessionPricePaise must be a non-negative number.' });
      }
      updateData.mockSessionPricePaise = Math.round(price);
    }

    if (interviewerSharePercent !== undefined) {
      const share = Number(interviewerSharePercent);
      if (isNaN(share) || share < 0 || share > 100) {
        return res.status(400).json({ success: false, message: 'interviewerSharePercent must be between 0 and 100.' });
      }
      updateData.interviewerSharePercent = share;
    }

    if (minPayoutPaise !== undefined) {
      const minPayout = Number(minPayoutPaise);
      if (isNaN(minPayout) || minPayout < 0) {
        return res.status(400).json({ success: false, message: 'minPayoutPaise must be a non-negative number.' });
      }
      updateData.minPayoutPaise = Math.round(minPayout);
    }

    if (pendingPaymentMinutes !== undefined) {
      const mins = Number(pendingPaymentMinutes);
      if (isNaN(mins) || mins < 1) {
        return res.status(400).json({ success: false, message: 'pendingPaymentMinutes must be at least 1 minute.' });
      }
      updateData.pendingPaymentMinutes = Math.round(mins);
    }

    if (joinOpensMinutesBefore !== undefined) {
      const mins = Number(joinOpensMinutesBefore);
      if (isNaN(mins) || mins < 0) {
        return res.status(400).json({ success: false, message: 'joinOpensMinutesBefore must be non-negative.' });
      }
      updateData.joinOpensMinutesBefore = Math.round(mins);
    }

    if (joinGraceMinutesAfter !== undefined) {
      const mins = Number(joinGraceMinutesAfter);
      if (isNaN(mins) || mins < 0) {
        return res.status(400).json({ success: false, message: 'joinGraceMinutesAfter must be non-negative.' });
      }
      updateData.joinGraceMinutesAfter = Math.round(mins);
    }

    if (noShowWaitMinutes !== undefined) {
      const mins = Number(noShowWaitMinutes);
      if (isNaN(mins) || mins < 0) {
        return res.status(400).json({ success: false, message: 'noShowWaitMinutes must be non-negative.' });
      }
      updateData.noShowWaitMinutes = Math.round(mins);
    }

    if (payoutHoldDays !== undefined) {
      const days = Number(payoutHoldDays);
      if (isNaN(days) || days < 0) {
        return res.status(400).json({ success: false, message: 'payoutHoldDays must be non-negative.' });
      }
      updateData.payoutHoldDays = Math.round(days);
    }

    if (platformCommissionPercent !== undefined) updateData.platformCommissionPercent = Number(platformCommissionPercent);
    if (gstPercent !== undefined) updateData.gstPercent = Number(gstPercent);
    if (refundWindowHours !== undefined) updateData.refundWindowHours = Number(refundWindowHours);
    if (supportEmail !== undefined) updateData.supportEmail = String(supportEmail).trim();
    if (siteName !== undefined) updateData.siteName = String(siteName).trim();

    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings(updateData);
    } else {
      Object.assign(settings, updateData);
    }
    await settings.save();

    res.json({
      success: true,
      message: 'Platform settings updated successfully',
      data: settings
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/settings/interview-config
// @desc    Get interview options (topics, difficulties, companies)
// @access  Public / Authenticated
router.get('/interview-config', async (req, res) => {
  try {
    const config = await InterviewConfig.getConfig();
    res.json({
      success: true,
      data: config
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/settings/interview-config
// @desc    Update interview options (topics, difficulties, companies)
// @access  Admin only
router.put('/interview-config', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { topics, difficulties, companies } = req.body;
    let config = await InterviewConfig.findOne();
    if (!config) {
      config = new InterviewConfig({ topics, difficulties, companies });
    } else {
      if (Array.isArray(topics)) config.topics = topics;
      if (Array.isArray(difficulties)) config.difficulties = difficulties;
      if (Array.isArray(companies)) config.companies = companies;
    }
    await config.save();

    res.json({
      success: true,
      message: 'Interview configuration updated successfully',
      data: config
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

