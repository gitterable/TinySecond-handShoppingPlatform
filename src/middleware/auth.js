'use strict';

const db = require('../db');

/**
 * Loads the current user (if logged in) onto req.user and res.locals
 * so templates can render conditionally. Also enforces account status:
 * suspended users are forcibly logged out.
 */
function loadUser(req, res, next) {
  res.locals.currentUser = null;
  req.user = null;

  const userId = req.session && req.session.userId;
  if (userId) {
    const user = db
      .prepare('SELECT id, username, bio, balance, is_admin, status FROM user WHERE id = ?')
      .get(userId);

    if (!user || user.status === 'suspended') {
      // Invalid or suspended session – destroy it.
      req.session.destroy(() => {});
    } else {
      req.user = user;
      res.locals.currentUser = user;
    }
  }
  next();
}

/** Require an authenticated, active session. */
function requireLogin(req, res, next) {
  if (!req.user) {
    req.session.flash = { type: 'error', message: '로그인이 필요합니다.' };
    return res.redirect('/login');
  }
  next();
}

/** Require an administrator account. */
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).render('error', {
      title: '접근 거부',
      message: '관리자만 접근할 수 있습니다.',
    });
  }
  next();
}

module.exports = { loadUser, requireLogin, requireAdmin };
