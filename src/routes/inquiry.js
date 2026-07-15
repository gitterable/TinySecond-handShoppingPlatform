'use strict';

const express = require('express');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');
const { validateText } = require('../utils/validation');

const router = express.Router();

/** Inquiry form + the current user's own inquiry history. */
router.get('/inquiry', requireLogin, (req, res) => {
  const inquiries = db
    .prepare('SELECT * FROM inquiry WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user.id);
  res.render('inquiry', { title: '관리자 문의', inquiries, values: {} });
});

/** Submit a new inquiry to the administrators. */
router.post('/inquiry', requireLogin, (req, res) => {
  const { subject, content } = req.body;

  const errors = [];
  const subjectErr = validateText(subject, { max: 100, field: '제목' });
  if (subjectErr || !subject.trim()) errors.push(subjectErr || '제목을 입력하세요.');
  const contentErr = validateText(content, { max: 2000, field: '문의 내용' });
  if (contentErr || !content.trim()) errors.push(contentErr || '문의 내용을 입력하세요.');

  if (errors.length > 0) {
    const inquiries = db
      .prepare('SELECT * FROM inquiry WHERE user_id = ? ORDER BY created_at DESC')
      .all(req.user.id);
    return res.status(400).render('inquiry', {
      title: '관리자 문의',
      inquiries,
      errors,
      values: { subject, content },
    });
  }

  db.prepare('INSERT INTO inquiry (user_id, subject, content) VALUES (?, ?, ?)').run(
    req.user.id,
    subject.trim(),
    content.trim()
  );

  req.session.flash = { type: 'success', message: '문의가 접수되었습니다.' };
  res.redirect('/inquiry');
});

module.exports = router;
