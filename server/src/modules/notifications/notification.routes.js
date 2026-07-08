const router = require('express').Router();
const asyncHandler = require('../../utils/asyncHandler');
const { requireAuth } = require('../../middleware/auth');
const Notification = require('./notification.model');

router.use(requireAuth);

// GET /api/notifications — newest first, capped
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await Notification.find({ user: req.user.id }).sort('-createdAt').limit(50);
    const unread = await Notification.countDocuments({ user: req.user.id, read: false });
    res.json({ success: true, notifications: items, unread });
  })
);

// PATCH /api/notifications/read-all
router.patch(
  '/read-all',
  asyncHandler(async (req, res) => {
    await Notification.updateMany({ user: req.user.id, read: false }, { read: true });
    res.json({ success: true });
  })
);

module.exports = router;
