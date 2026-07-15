'use strict';

const express = require('express');
const db = require('../db');
const config = require('../config');
const { requireLogin } = require('../middleware/auth');
const { validateText } = require('../utils/validation');

const router = express.Router();

router.get('/report', requireLogin, (req, res) => {
  const targetType = req.query.type === 'product' ? 'product' : 'user';
  const targetId = parseInt(req.query.id, 10);

  // Resolve a human-readable label so the target is shown (and fixed),
  // instead of letting the reporter type/adjust a raw ID.
  let targetLabel = '';
  if (!Number.isNaN(targetId)) {
    if (targetType === 'product') {
      const p = db
        .prepare('SELECT p.name, u.username AS seller FROM product p JOIN user u ON u.id = p.seller_id WHERE p.id = ?')
        .get(targetId);
      if (p) targetLabel = `상품 "${p.name}" (판매자: ${p.seller})`;
    } else {
      const u = db.prepare('SELECT username FROM user WHERE id = ?').get(targetId);
      if (u) targetLabel = `사용자 "${u.username}"`;
    }
  }

  res.render('report', {
    title: '신고하기',
    values: { targetType, targetId: Number.isNaN(targetId) ? '' : targetId, targetLabel },
  });
});

router.post('/report', requireLogin, (req, res) => {
  const { targetType, targetId, reason } = req.body;

  if (targetType !== 'user' && targetType !== 'product') {
    req.session.flash = { type: 'error', message: '잘못된 신고 대상 유형입니다.' };
    return res.redirect('/report');
  }
  const id = parseInt(targetId, 10);
  if (Number.isNaN(id)) {
    req.session.flash = { type: 'error', message: '잘못된 대상 ID입니다.' };
    return res.redirect('/report');
  }
  const reasonErr = validateText(reason, { max: 500, field: '신고 사유' });
  if (reasonErr || !reason.trim()) {
    req.session.flash = { type: 'error', message: reasonErr || '신고 사유를 입력하세요.' };
    return res.redirect('/report');
  }

  // Verify the target actually exists.
  const table = targetType === 'user' ? 'user' : 'product';
  const target = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id);
  if (!target) {
    req.session.flash = { type: 'error', message: '신고 대상을 찾을 수 없습니다.' };
    return res.redirect('/report');
  }
  if (targetType === 'user' && id === req.user.id) {
    req.session.flash = { type: 'error', message: '본인은 신고할 수 없습니다.' };
    return res.redirect('/report');
  }

  try {
    db.prepare(
      'INSERT INTO report (reporter_id, target_type, target_id, reason) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, targetType, id, reason.trim());
  } catch (err) {
    // UNIQUE constraint => already reported by this user.
    req.session.flash = { type: 'error', message: '이미 신고한 대상입니다.' };
    return res.redirect('/report');
  }

  // Count DISTINCT reporters and auto-moderate past the threshold.
  const count = db
    .prepare('SELECT COUNT(*) AS c FROM report WHERE target_type = ? AND target_id = ?')
    .get(targetType, id).c;

  if (targetType === 'product' && count >= config.moderation.blockThreshold) {
    db.prepare("UPDATE product SET status = 'blocked' WHERE id = ?").run(id);
  }
  if (targetType === 'user' && count >= config.moderation.suspendThreshold) {
    db.prepare("UPDATE user SET status = 'suspended' WHERE id = ?").run(id);
  }

  req.session.flash = { type: 'success', message: '신고가 접수되었습니다.' };
  res.redirect('/');
});

module.exports = router;
