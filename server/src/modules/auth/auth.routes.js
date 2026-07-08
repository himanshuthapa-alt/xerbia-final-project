const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../../utils/asyncHandler');
const { requireAuth, requireRole } = require('../../middleware/auth');
const ctrl = require('./auth.controller');

// Brute-force guard on the auth surface, tighter than the global limiter.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, try again later' },
});

router.post('/login', loginLimiter, asyncHandler(ctrl.login));
router.post('/refresh', asyncHandler(ctrl.refresh));
router.get('/me', requireAuth, asyncHandler(ctrl.me));
router.post('/change-password', requireAuth, asyncHandler(ctrl.changePassword));
router.get('/login-history', requireAuth, asyncHandler(ctrl.loginHistory));

// Password reset is an admin/IT action (no SMTP in scope for v1)
router.post(
  '/reset-password',
  requireAuth,
  requireRole('IT_ADMIN', 'ORG_ADMIN', 'HR'),
  asyncHandler(ctrl.resetPassword)
);

module.exports = router;
