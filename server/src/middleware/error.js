const mongoose = require('mongoose');
const env = require('../config/env');

// 404 for unknown routes
function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// Global error handler — keep internals out of the response body.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  // Mongo not reachable → 503 rather than a scary stack trace
  if (err.name === 'MongooseError' || err.message?.includes('buffering')) {
    return res.status(503).json({ success: false, message: 'Database unavailable. Try again shortly.' });
  }

  // Duplicate key (unique index) → 409
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({ success: false, message: `Duplicate value for ${field}` });
  }

  // Mongoose validation / bad ObjectId → 400
  if (err instanceof mongoose.Error.ValidationError) {
    const first = Object.values(err.errors)[0];
    return res.status(400).json({ success: false, message: first?.message || 'Validation failed' });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ success: false, message: `Invalid ${err.path}` });
  }

  const status = err.isOperational ? err.statusCode : 500;
  if (!err.isOperational) {
    console.error('[error]', err); // log the real thing server-side
  }
  res.status(status).json({
    success: false,
    message: err.isOperational ? err.message : 'Internal server error',
    ...(env.nodeEnv === 'development' && !err.isOperational ? { detail: err.message } : {}),
  });
}

module.exports = { notFound, errorHandler };
