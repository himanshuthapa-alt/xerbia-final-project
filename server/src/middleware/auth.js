const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * Verifies the Bearer access token and attaches { id, role, employeeId } to req.user.
 */
function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(ApiError.unauthorized('Missing access token'));

  try {
    const payload = jwt.verify(token, env.jwt.accessSecret);
    req.user = { id: payload.sub, role: payload.role, employeeId: payload.employeeId };
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return next(ApiError.unauthorized('Token expired'));
    return next(ApiError.unauthorized('Invalid token'));
  }
}

/**
 * Role gate. Usage: router.post('/', requireAuth, requireRole('HR', 'SUPER_ADMIN'), handler)
 * SUPER_ADMIN always passes.
 */
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (req.user.role === 'SUPER_ADMIN' || roles.includes(req.user.role)) return next();
    return next(ApiError.forbidden(`Requires one of: ${roles.join(', ')}`));
  };
}

module.exports = { requireAuth, requireRole };
