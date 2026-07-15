'use strict';

const crypto = require('crypto');

/**
 * Minimal, dependency-free CSRF protection using the synchronizer token
 * pattern. A per-session secret token is generated and must be echoed back
 * in a hidden form field (or X-CSRF-Token header) on every state-changing
 * request. Tokens are compared in constant time to avoid timing attacks.
 */

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function ensureToken(req, res) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateToken();
  }
  res.locals.csrfToken = req.session.csrfToken;
}

/** Returns true when the request carries a valid CSRF token. */
function tokenValid(req) {
  const submitted =
    (req.body && req.body._csrf) ||
    req.headers['x-csrf-token'] ||
    req.headers['csrf-token'];

  const expected = req.session.csrfToken;

  if (!submitted || !expected || submitted.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(submitted), Buffer.from(expected));
}

function reject(res) {
  return res.status(403).render('error', {
    title: '요청 거부',
    message: '유효하지 않은 CSRF 토큰입니다. 페이지를 새로고침 후 다시 시도하세요.',
  });
}

/**
 * Global CSRF middleware. Verifies token on state-changing requests.
 *
 * NOTE: multipart/form-data bodies are parsed later by multer (inside the
 * route), so `req.body._csrf` is not available here yet. For those requests
 * we defer verification – the route MUST call `verifyCsrf` after multer runs.
 */
function csrfProtection(req, res, next) {
  ensureToken(req, res);

  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  const contentType = req.headers['content-type'] || '';
  if (contentType.startsWith('multipart/form-data')) {
    // Deferred: verified in-route after the body is parsed.
    return next();
  }

  if (!tokenValid(req)) {
    return reject(res);
  }
  next();
}

/**
 * In-route CSRF verification for handlers that parse the body themselves
 * (e.g. multipart uploads via multer). Call after the body is parsed.
 */
function verifyCsrf(req, res, next) {
  if (!tokenValid(req)) {
    return reject(res);
  }
  next();
}

module.exports = { csrfProtection, verifyCsrf, tokenValid };
