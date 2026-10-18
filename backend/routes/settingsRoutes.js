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
// @desc    Update platform settings
// @access  Admin only
router.put('/', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const updateData = req.body;
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

