const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');
const { User } = require('./user.model');

const MAX_FAILED_ATTEMPTS = 5; // BR-04
const LOCK_MINUTES = 15;

function signAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, employeeId: user.employee?.toString() },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessTtl } // BR-06: configurable expiry
  );
}

function signRefreshToken(user) {
  return jwt.sign({ sub: user._id.toString(), type: 'refresh' }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshTtl,
  });
}

/**
 * POST /api/auth/login  (FR-A01)
 * Response shape matches the spec:
 *   { success, token, refreshToken, role, userId }
 */
async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) throw ApiError.badRequest('Email and password are required');

  const user = await User.findOne({ email: String(email).toLowerCase().trim() })
    .select('+passwordHash +loginHistory');

  // Same message for unknown user / wrong password — don't leak which one it was.
  if (!user || !user.isActive) throw ApiError.unauthorized('Invalid Credentials');

  if (user.isLocked()) {
    throw ApiError.forbidden('Account locked after multiple failed attempts. Contact Admin.');
  }

  const ok = await user.comparePassword(password);
  const historyEntry = { ip: req.ip, userAgent: req.headers['user-agent'], success: ok };

  if (!ok) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
    }
    user.loginHistory.push(historyEntry);
    await user.save();
    throw ApiError.unauthorized('Invalid Credentials');
  }

  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  user.loginHistory.push(historyEntry); // acceptance: login history stored
  if (user.loginHistory.length > 50) user.loginHistory = user.loginHistory.slice(-50);
  await user.save();

  res.json({
    success: true,
    token: signAccessToken(user),
    refreshToken: signRefreshToken(user),
    role: user.role,
    userId: user._id,
    name: user.name,
    employeeId: user.employee || null,
  });
}

/**
 * POST /api/auth/refresh  (FR-A06 / BR-07)
 */
async function refresh(req, res) {
  const { refreshToken } = req.body || {};
  if (!refreshToken) throw ApiError.badRequest('refreshToken is required');

  let payload;
  try {
    payload = jwt.verify(refreshToken, env.jwt.refreshSecret);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }
  if (payload.type !== 'refresh') throw ApiError.unauthorized('Not a refresh token');

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw ApiError.unauthorized('Access Denied'); // deleted user edge case

  res.json({ success: true, token: signAccessToken(user), role: user.role });
}

/**
 * GET /api/auth/me  (FR-A09)
 */
async function me(req, res) {
  const user = await User.findById(req.user.id).populate('employee', 'employeeId name department designation');
  if (!user) throw ApiError.unauthorized('Access Denied');
  res.json({ success: true, user });
}

/**
 * POST /api/auth/change-password  (FR-A04)
 */
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    throw ApiError.badRequest('currentPassword and newPassword are required');
  }

  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!user) throw ApiError.unauthorized();

  const ok = await user.comparePassword(currentPassword);
  if (!ok) throw ApiError.unauthorized('Current password is incorrect');

  user.passwordHash = await User.hashPassword(newPassword);
  await user.save();
  res.json({ success: true, message: 'Password updated' });
}

/**
 * POST /api/auth/reset-password  (FR-A02/A03 — admin/IT resets, no email service in scope)
 */
async function resetPassword(req, res) {
  const { email, newPassword } = req.body || {};
  if (!email || !newPassword) throw ApiError.badRequest('email and newPassword are required');

  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+passwordHash');
  if (!user) throw ApiError.notFound('No user with that email');

  user.passwordHash = await User.hashPassword(newPassword);
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined; // also unlocks the account
  await user.save();
  res.json({ success: true, message: `Password reset for ${user.email}` });
}

/**
 * GET /api/auth/login-history — own history
 */
async function loginHistory(req, res) {
  const user = await User.findById(req.user.id).select('+loginHistory');
  res.json({ success: true, history: (user?.loginHistory || []).slice().reverse() });
}

module.exports = { login, refresh, me, changePassword, resetPassword, loginHistory };
