'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const config = require('../config');
const { requireLogin } = require('../middleware/auth');
const { validatePassword, validateText } = require('../utils/validation');

const router = express.Router();

/** My page (edit bio / password). */
router.get('/mypage', requireLogin, (req, res) => {
  const fresh = db
    .prepare('SELECT id, username, bio, balance FROM user WHERE id = ?')
    .get(req.user.id);
  res.render('mypage', { title: '마이페이지', profile: fresh });
});

/** Update bio. */
router.post('/mypage/bio', requireLogin, (req, res) => {
  const { bio } = req.body;
  const err = validateText(bio, { max: 500, field: '소개글' });
  if (err) {
    req.session.flash = { type: 'error', message: err };
    return res.redirect('/mypage');
  }
  db.prepare('UPDATE user SET bio = ? WHERE id = ?').run(bio, req.user.id);
  req.session.flash = { type: 'success', message: '소개글이 수정되었습니다.' };
  res.redirect('/mypage');
});

/** Update password (requires current password). */
router.post('/mypage/password', requireLogin, (req, res) => {
  const { currentPassword, newPassword, newPasswordConfirm } = req.body;

  const user = db.prepare('SELECT password_hash FROM user WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword || '', user.password_hash)) {
    req.session.flash = { type: 'error', message: '현재 비밀번호가 올바르지 않습니다.' };
    return res.redirect('/mypage');
  }

  const pwErr = validatePassword(newPassword);
  if (pwErr) {
    req.session.flash = { type: 'error', message: pwErr };
    return res.redirect('/mypage');
  }
  if (newPassword !== newPasswordConfirm) {
    req.session.flash = { type: 'error', message: '새 비밀번호가 일치하지 않습니다.' };
    return res.redirect('/mypage');
  }

  const newHash = bcrypt.hashSync(newPassword, config.bcryptRounds);
  db.prepare('UPDATE user SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);
  req.session.flash = { type: 'success', message: '비밀번호가 변경되었습니다.' };
  res.redirect('/mypage');
});

/** Public profile view. */
router.get('/users/:id', requireLogin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).render('error', { title: '오류', message: '잘못된 사용자 ID입니다.' });
  }
  const profile = db
    .prepare('SELECT id, username, bio, status FROM user WHERE id = ?')
    .get(id);
  if (!profile) {
    return res.status(404).render('error', { title: '없음', message: '사용자를 찾을 수 없습니다.' });
  }
  const products = db
    .prepare("SELECT id, name, price, status FROM product WHERE seller_id = ? AND status != 'blocked' ORDER BY created_at DESC")
    .all(id);
  res.render('profile', { title: `${profile.username}님의 프로필`, profile, products });
});

module.exports = router;
