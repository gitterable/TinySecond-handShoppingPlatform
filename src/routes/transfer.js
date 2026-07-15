'use strict';

const express = require('express');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');
const { validateAmount } = require('../utils/validation');

const router = express.Router();

router.get('/transfer', requireLogin, (req, res) => {
  const balance = db.prepare('SELECT balance FROM user WHERE id = ?').get(req.user.id).balance;
  const history = db
    .prepare(
      `SELECT t.*, s.username AS sender_name, r.username AS receiver_name
       FROM transfer t
       JOIN user s ON s.id = t.sender_id
       JOIN user r ON r.id = t.receiver_id
       WHERE t.sender_id = ? OR t.receiver_id = ?
       ORDER BY t.created_at DESC LIMIT 50`
    )
    .all(req.user.id, req.user.id);
  res.render('transfer', { title: '송금', balance, history });
});

router.post('/transfer', requireLogin, (req, res) => {
  const { receiver, amount } = req.body;

  const amountErr = validateAmount(amount);
  if (amountErr) {
    req.session.flash = { type: 'error', message: amountErr };
    return res.redirect('/transfer');
  }
  const amountInt = parseInt(amount, 10);

  const receiverUser = db.prepare('SELECT id, status FROM user WHERE username = ?').get(receiver || '');
  if (!receiverUser) {
    req.session.flash = { type: 'error', message: '받는 사용자를 찾을 수 없습니다.' };
    return res.redirect('/transfer');
  }
  if (receiverUser.id === req.user.id) {
    req.session.flash = { type: 'error', message: '본인에게는 송금할 수 없습니다.' };
    return res.redirect('/transfer');
  }

  /**
   * Atomic transfer: better-sqlite3 runs this synchronously inside a single
   * transaction, so the balance check + debit + credit cannot interleave with
   * another request (prevents race-condition double-spend). We re-read the
   * sender's balance INSIDE the transaction rather than trusting the session.
   */
  const doTransfer = db.transaction((senderId, receiverId, value) => {
    const sender = db.prepare('SELECT balance FROM user WHERE id = ?').get(senderId);
    if (sender.balance < value) {
      throw new Error('INSUFFICIENT_FUNDS');
    }
    db.prepare('UPDATE user SET balance = balance - ? WHERE id = ?').run(value, senderId);
    db.prepare('UPDATE user SET balance = balance + ? WHERE id = ?').run(value, receiverId);
    db.prepare('INSERT INTO transfer (sender_id, receiver_id, amount) VALUES (?, ?, ?)').run(
      senderId,
      receiverId,
      value
    );
  });

  try {
    doTransfer(req.user.id, receiverUser.id, amountInt);
    req.session.flash = { type: 'success', message: `${receiver}님에게 ${amountInt}원을 송금했습니다.` };
  } catch (err) {
    if (err.message === 'INSUFFICIENT_FUNDS') {
      req.session.flash = { type: 'error', message: '잔액이 부족합니다.' };
    } else {
      req.session.flash = { type: 'error', message: '송금 처리 중 오류가 발생했습니다.' };
    }
  }
  res.redirect('/transfer');
});

module.exports = router;
