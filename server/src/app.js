const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

// --- security & plumbing ---
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
if (env.nodeEnv === 'development') app.use(morgan('dev'));

// Global API rate limit (per-route limiters are stricter where needed)
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// --- health ---
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'workforce-api', time: new Date().toISOString() })
);

// --- feature modules ---
app.use('/api/auth', require('./modules/auth/auth.routes'));
app.use('/api/org', require('./modules/org/org.routes'));
app.use('/api/employees', require('./modules/employees/employee.routes'));
app.use('/api/recruitment', require('./modules/recruitment/recruitment.routes'));
app.use('/api/attendance', require('./modules/attendance/attendance.routes'));
app.use('/api/leave', require('./modules/leave/leave.routes'));
app.use('/api/payroll', require('./modules/payroll/payroll.routes'));
app.use('/api/performance', require('./modules/performance/performance.routes'));
app.use('/api/projects', require('./modules/projects/project.routes'));
app.use('/api/notifications', require('./modules/notifications/notification.routes'));
app.use('/api/ai', require('./modules/ai/ai.routes'));
app.use('/api/analytics', require('./modules/analytics/analytics.routes'));

// --- errors last ---
app.use(notFound);
app.use(errorHandler);

module.exports = app;
