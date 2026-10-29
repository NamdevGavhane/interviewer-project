const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { authenticate } = require('../middleware/auth');
const { validateObjectId } = require('../middleware/validateObjectId');
const { getPagination } = require('../utils/pagination');
const { pollingLimiter } = require('../middleware/rateLimiter');

router.use(authenticate, pollingLimiter);

// @route   GET /api/notifications
// @desc    Get current user's in-app notifications & unread count
// @access  Protected
router.get('/', async (req, res) => {
  try {
    const { page, limit, skip, formatMeta } = getPagination(req.query, 20);

    const [total, notifications, unreadCount] = await Promise.all([
      Notification.countDocuments({ userId: req.user._id }),
      Notification.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Notification.countDocuments({ userId: req.user._id, isRead: false })
    ]);

    res.json({
      success: true,
      unreadCount,
      notifications,
      data: notifications,
      pagination: formatMeta(total)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/notifications/:id/read
// @desc    Mark a single notification as read
// @access  Protected
router.patch('/:id/read', validateObjectId('id'), async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { isRead: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, notification });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/notifications/read-all
// @desc    Mark all user's notifications as read
// @access  Protected
router.patch('/read-all', async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { $set: { isRead: true } }
    );

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/notifications/:id
// @desc    Delete a notification
// @access  Protected
router.delete('/:id', validateObjectId('id'), async (req, res) => {
  try {
    await Notification.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    res.json({ success: true, message: 'Notification deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
