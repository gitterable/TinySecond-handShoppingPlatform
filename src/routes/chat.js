'use strict';

const express = require('express');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

/** Global real-time chat page. */
router.get('/chat', requireLogin, (req, res) => {
  res.render('chat', { title: '전체 채팅' });
});

/** 1:1 direct chat with a specific user. */
router.get('/chat/:userId', requireLogin, (req, res) => {
  const otherId = parseInt(req.params.userId, 10);
  if (Number.isNaN(otherId)) {
    return res.status(400).render('error', { title: '오류', message: '잘못된 사용자 ID입니다.' });
  }
  if (otherId === req.user.id) {
    return res.status(400).render('error', { title: '오류', message: '자기 자신과는 대화할 수 없습니다.' });
  }
  const other = db.prepare('SELECT id, username FROM user WHERE id = ?').get(otherId);
  if (!other) {
    return res.status(404).render('error', { title: '없음', message: '사용자를 찾을 수 없습니다.' });
  }
  res.render('dm', { title: `${other.username}님과의 대화`, other });
});

module.exports = router;
