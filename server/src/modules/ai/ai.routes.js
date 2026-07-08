const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../../utils/asyncHandler');
const { requireAuth } = require('../../middleware/auth');
const ctrl = require('./ai.controller');

// External AI API may be rate-limited (spec constraint) — protect our quota per user.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { success: false, message: 'AI rate limit: max 10 requests/minute' },
});

router.use(requireAuth, aiLimiter);

router.post('/chat', asyncHandler(ctrl.chat));
router.post('/payroll-explain', asyncHandler(ctrl.payrollExplain));
router.post('/summarize', asyncHandler(ctrl.summarize));

module.exports = router;
