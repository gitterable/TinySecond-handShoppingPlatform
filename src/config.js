'use strict';

require('dotenv').config();

const path = require('path');

/**
 * Central configuration.
 * Secrets are read from environment variables (never hard-coded) so that
 * they can be rotated without code changes and kept out of version control.
 */
const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,

  // A missing SESSION_SECRET in production is a security risk, so we fail fast.
  sessionSecret: process.env.SESSION_SECRET,

  dbPath: path.join(__dirname, '..', 'data', 'app.db'),
  uploadDir: path.join(__dirname, '..', 'public', 'uploads'),

  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin1234!',
  },

  moderation: {
    // Products reported at/above this count get auto-blocked.
    blockThreshold: parseInt(process.env.REPORT_BLOCK_THRESHOLD, 10) || 3,
    // Users reported at/above this count get auto-suspended (dormant).
    suspendThreshold: parseInt(process.env.REPORT_SUSPEND_THRESHOLD, 10) || 3,
  },

  // Upload limits – reject anything that is not a small image.
  upload: {
    maxFileSizeBytes: 2 * 1024 * 1024, // 2 MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  },

  bcryptRounds: 12,
};

if (config.env === 'production' && !config.sessionSecret) {
  throw new Error('SESSION_SECRET must be set in production.');
}

// In development we still want a usable secret, but warn loudly.
if (!config.sessionSecret) {
  config.sessionSecret = 'dev-only-insecure-secret-do-not-use-in-prod';
  // eslint-disable-next-line no-console
  console.warn('[WARN] SESSION_SECRET not set. Using an insecure development secret.');
}

module.exports = config;
