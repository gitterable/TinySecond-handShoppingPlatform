'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const config = require('../config');
const { validateUsername, validatePassword } = require('../utils/validation');

const router = express.Router();

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('register', { title: '회원가입', values: {} });
});

router.post('/register', (req, res) => {
  const { username, password, passwordConfirm } = req.body;

  const errors = [];
  const usernameErr = validateUsername(username);
  if (usernameErr) errors.push(usernameErr);
  const passwordErr = validatePassword(password);
  if (passwordErr) errors.push(passwordErr);
  if (password !== passwordConfirm) errors.push('비밀번호가 일치하지 않습니다.');

  if (errors.length > 0) {
    return res.status(400).render('register', {
      title: '회원가입',
      errors,
      values: { username },
    });
  }

  // Parameterized query prevents SQL injection.
  const existing = db.prepare('SELECT id FROM user WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).render('register', {
      title: '회원가입',
      errors: ['이미 사용 중인 아이디입니다.'],
      values: { username },
    });
  }

  const passwordHash = bcrypt.hashSync(password, config.bcryptRounds);
  const result = db
    .prepare('INSERT INTO user (username, password_hash) VALUES (?, ?)')
    .run(username, passwordHash);

  // Regenerate session to prevent session fixation.
  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).render('error', { title: '오류', message: '가입 처리 중 오류가 발생했습니다.' });
    }
    req.session.userId = result.lastInsertRowid;
    req.session.flash = { type: 'success', message: '회원가입이 완료되었습니다.' };
    res.redirect('/');
  });
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('login', { title: '로그인', values: {} });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  const user = db.prepare('SELECT * FROM user WHERE username = ?').get(username || '');

  // Always run a bcrypt compare (even on unknown user) to reduce user
  // enumeration via timing, and keep a generic error message.
  const dummyHash = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO7Q0j0j0j0j0j0j0j0j0j0j0j0j0j0j2';
  const ok = bcrypt.compareSync(password || '', user ? user.password_hash : dummyHash);

  if (!user || !ok) {
    return res.status(401).render('login', {
      title: '로그인',
      errors: ['아이디 또는 비밀번호가 올바르지 않습니다.'],
      values: { username },
    });
  }

  if (user.status === 'suspended') {
    return res.status(403).render('login', {
      title: '로그인',
      errors: ['정지(휴면)된 계정입니다. 관리자에게 문의하세요.'],
      values: { username },
    });
  }

  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).render('error', { title: '오류', message: '로그인 처리 중 오류가 발생했습니다.' });
    }
    req.session.userId = user.id;
    req.session.flash = { type: 'success', message: `환영합니다, ${user.username}님!` };
    // Administrators land directly on the admin dashboard, not the shop home.
    res.redirect(user.is_admin ? '/admin' : '/');
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.redirect('/login');
  });
});

module.exports = router;
