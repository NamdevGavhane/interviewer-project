const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');

/**
 * @route   GET /api/config/public
 * @desc    Public configuration: returns fixed session price in paise, currency, min payout, and timing parameters
 * @access  Public
 */
router.get('/public', async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.json({
      success: true,
      mockSessionPricePaise: settings.mockSessionPricePaise ?? 5000,
      currency: settings.currency || 'INR',
      minPayoutPaise: settings.minPayoutPaise ?? 30000,
      interviewerSharePercent: settings.interviewerSharePercent ?? 70,
      pendingPaymentMinutes: settings.pendingPaymentMinutes ?? 10,
      joinOpensMinutesBefore: settings.joinOpensMinutesBefore ?? 10,
      joinGraceMinutesAfter: settings.joinGraceMinutesAfter ?? 15,
      noShowWaitMinutes: settings.noShowWaitMinutes ?? 10
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
