'use strict';

const express = require('express');
const db = require('../db');
const { requireLogin, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Every admin route requires an active login AND admin privilege.
router.use(requireLogin, requireAdmin);

router.get('/admin', (req, res) => {
  const users = db
    .prepare('SELECT id, username, balance, is_admin, status FROM user ORDER BY id')
    .all();
  const products = db
    .prepare(
      `SELECT p.id, p.name, p.price, p.status, u.username AS seller
       FROM product p JOIN user u ON u.id = p.seller_id ORDER BY p.id DESC`
    )
    .all();
  const reports = db
    .prepare(
      `SELECT r.*, u.username AS reporter
       FROM report r JOIN user u ON u.id = r.reporter_id ORDER BY r.created_at DESC`
    )
    .all();
  const inquiries = db
    .prepare(
      `SELECT i.*, u.username AS asker
       FROM inquiry i JOIN user u ON u.id = i.user_id ORDER BY
       CASE i.status WHEN 'open' THEN 0 ELSE 1 END, i.created_at DESC`
    )
    .all();
  const transfers = db
    .prepare(
      `SELECT t.*, s.username AS sender_name, r.username AS receiver_name
       FROM transfer t
       JOIN user s ON s.id = t.sender_id
       JOIN user r ON r.id = t.receiver_id
       ORDER BY t.created_at DESC LIMIT 200`
    )
    .all();
  res.render('admin', { title: '관리자', users, products, reports, inquiries, transfers });
});

/** Answer a user's inquiry. */
router.post('/admin/inquiries/:id/answer', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { answer } = req.body;
  const inquiry = db.prepare('SELECT id FROM inquiry WHERE id = ?').get(id);
  if (!inquiry) {
    req.session.flash = { type: 'error', message: '문의를 찾을 수 없습니다.' };
    return res.redirect('/admin');
  }
  if (typeof answer !== 'string' || !answer.trim() || answer.length > 2000) {
    req.session.flash = { type: 'error', message: '답변은 1~2000자여야 합니다.' };
    return res.redirect('/admin');
  }
  db.prepare(
    "UPDATE inquiry SET answer = ?, status = 'answered', answered_at = datetime('now') WHERE id = ?"
  ).run(answer.trim(), id);
  req.session.flash = { type: 'success', message: '답변이 등록되었습니다.' };
  res.redirect('/admin');
});

/** Suspend / reactivate a user. */
router.post('/admin/users/:id/status', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const status = req.body.status === 'suspended' ? 'suspended' : 'active';
  const target = db.prepare('SELECT id, is_admin FROM user WHERE id = ?').get(id);
  if (!target) {
    req.session.flash = { type: 'error', message: '사용자를 찾을 수 없습니다.' };
    return res.redirect('/admin');
  }
  // Prevent locking out admin accounts.
  if (target.is_admin) {
    req.session.flash = { type: 'error', message: '관리자 계정은 정지할 수 없습니다.' };
    return res.redirect('/admin');
  }
  db.prepare('UPDATE user SET status = ? WHERE id = ?').run(status, id);
  req.session.flash = { type: 'success', message: '사용자 상태가 변경되었습니다.' };
  res.redirect('/admin');
});

/** Charge (top up) a user's balance. Admin only. */
router.post('/admin/users/:id/charge', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { amount } = req.body;
  const target = db.prepare('SELECT id FROM user WHERE id = ?').get(id);
  if (!target) {
    req.session.flash = { type: 'error', message: '사용자를 찾을 수 없습니다.' };
    return res.redirect('/admin');
  }
  const amountInt = parseInt(amount, 10);
  if (!Number.isInteger(amountInt) || amountInt < 1 || amountInt > 1000000000) {
    req.session.flash = { type: 'error', message: '충전 금액은 1 이상의 정수여야 합니다.' };
    return res.redirect('/admin');
  }
  db.prepare('UPDATE user SET balance = balance + ? WHERE id = ?').run(amountInt, id);
  req.session.flash = { type: 'success', message: `${amountInt.toLocaleString()}원이 충전되었습니다.` };
  res.redirect('/admin');
});

/** Block / unblock or delete a product. */
router.post('/admin/products/:id/status', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const action = req.body.action;
  const product = db.prepare('SELECT id FROM product WHERE id = ?').get(id);
  if (!product) {
    req.session.flash = { type: 'error', message: '상품을 찾을 수 없습니다.' };
    return res.redirect('/admin');
  }
  if (action === 'delete') {
    db.prepare('DELETE FROM product WHERE id = ?').run(id);
  } else {
    const status = action === 'block' ? 'blocked' : 'active';
    db.prepare('UPDATE product SET status = ? WHERE id = ?').run(status, id);
  }
  req.session.flash = { type: 'success', message: '상품 상태가 변경되었습니다.' };
  res.redirect('/admin');
});

module.exports = router;
