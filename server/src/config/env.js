require('dotenv').config();

/**
 * Central place for every environment variable the app reads.
 * If you add a new env var, register it here — do not read
 * process.env from feature code directly.
 */
const env = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/workforce',

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    accessTtl: process.env.ACCESS_TOKEN_TTL || '15m',
    refreshTtl: process.env.REFRESH_TOKEN_TTL || '7d',
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  },

  attendance: {
    officeStart: process.env.OFFICE_START || '09:30',
    fullDayHours: parseFloat(process.env.FULL_DAY_HOURS || '9'),
    halfDayThreshold: parseFloat(process.env.HALF_DAY_THRESHOLD || '4.5'),
  },
};

module.exports = env;
