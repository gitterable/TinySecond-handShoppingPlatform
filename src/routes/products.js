'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const config = require('../config');
const { requireLogin } = require('../middleware/auth');
const { tokenValid } = require('../middleware/csrf');
const { validateProductName, validatePrice, validateText } = require('../utils/validation');

const router = express.Router();

// Ensure upload directory exists.
if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

/**
 * Multer storage with a randomized filename (never trust the client's
 * filename – prevents path traversal / overwrite attacks) and strict
 * file-type + size limits.
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = crypto.randomBytes(16).toString('hex') + ext;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxFileSizeBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimeOk = config.upload.allowedMimeTypes.includes(file.mimetype);
    const extOk = config.upload.allowedExtensions.includes(ext);
    if (!mimeOk || !extOk) {
      return cb(new Error('이미지 파일(jpg, png, gif, webp)만 업로드할 수 있습니다.'));
    }
    cb(null, true);
  },
});

/** Product list + search. Only shows the name (per spec). */
router.get('/products', requireLogin, (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  let products;
  if (q) {
    // LIKE with parameter binding; escape wildcard characters in user input.
    const escaped = q.replace(/[%_\\]/g, (m) => '\\' + m);
    products = db
      .prepare(
        "SELECT id, name, price FROM product WHERE status = 'active' AND name LIKE ? ESCAPE '\\' ORDER BY created_at DESC"
      )
      .all(`%${escaped}%`);
  } else {
    products = db
      .prepare("SELECT id, name, price FROM product WHERE status = 'active' ORDER BY created_at DESC")
      .all();
  }
  res.render('products', { title: '상품 목록', products, q });
});

/** New product form. */
router.get('/products/new', requireLogin, (req, res) => {
  res.render('product_new', { title: '상품 등록', values: {} });
});

/** Create product. */
router.post('/products', requireLogin, (req, res) => {
  upload.single('image')(req, res, (uploadErr) => {
    if (uploadErr) {
      return res.status(400).render('product_new', {
        title: '상품 등록',
        errors: [uploadErr.message],
        values: req.body,
      });
    }

    // CSRF is verified here (not in the global middleware) because multer
    // only just parsed the multipart body containing the _csrf field.
    if (!tokenValid(req)) {
      if (req.file) fs.unlink(path.join(config.uploadDir, req.file.filename), () => {});
      return res.status(403).render('error', {
        title: '요청 거부',
        message: '유효하지 않은 CSRF 토큰입니다. 페이지를 새로고침 후 다시 시도하세요.',
      });
    }

    const { name, description, price } = req.body;
    const errors = [];
    const nameErr = validateProductName(name);
    if (nameErr) errors.push(nameErr);
    const priceErr = validatePrice(price);
    if (priceErr) errors.push(priceErr);
    const descErr = validateText(description || '', { max: 2000, field: '상품 설명' });
    if (descErr) errors.push(descErr);

    if (errors.length > 0) {
      // Remove any uploaded file if validation failed.
      if (req.file) fs.unlink(path.join(config.uploadDir, req.file.filename), () => {});
      return res.status(400).render('product_new', { title: '상품 등록', errors, values: req.body });
    }

    const image = req.file ? `/uploads/${req.file.filename}` : null;
    const result = db
      .prepare(
        'INSERT INTO product (name, description, price, image, seller_id) VALUES (?, ?, ?, ?, ?)'
      )
      .run(name.trim(), description || '', parseInt(price, 10), image, req.user.id);

    req.session.flash = { type: 'success', message: '상품이 등록되었습니다.' };
    res.redirect(`/products/${result.lastInsertRowid}`);
  });
});

/** My products management. */
router.get('/my/products', requireLogin, (req, res) => {
  const products = db
    .prepare('SELECT id, name, price, status FROM product WHERE seller_id = ? ORDER BY created_at DESC')
    .all(req.user.id);
  res.render('my_products', { title: '내 상품 관리', products });
});

/** Product detail. */
router.get('/products/:id', requireLogin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).render('error', { title: '오류', message: '잘못된 상품 ID입니다.' });
  }
  const product = db
    .prepare(
      `SELECT p.*, u.username AS seller_name
       FROM product p JOIN user u ON u.id = p.seller_id
       WHERE p.id = ?`
    )
    .get(id);

  if (!product) {
    return res.status(404).render('error', { title: '없음', message: '상품을 찾을 수 없습니다.' });
  }
  // Blocked products are only visible to the owner or an admin.
  if (product.status === 'blocked' && product.seller_id !== req.user.id && !req.user.is_admin) {
    return res.status(404).render('error', { title: '없음', message: '상품을 찾을 수 없습니다.' });
  }

  const isOwner = product.seller_id === req.user.id;
  res.render('product_detail', { title: product.name, product, isOwner });
});

/** Buy a product: transfer price from buyer to seller, mark as sold. */
router.post('/products/:id/buy', requireLogin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const product = db.prepare('SELECT * FROM product WHERE id = ?').get(id);
  if (!product) {
    return res.status(404).render('error', { title: '없음', message: '상품을 찾을 수 없습니다.' });
  }
  if (product.seller_id === req.user.id) {
    req.session.flash = { type: 'error', message: '본인 상품은 구매할 수 없습니다.' };
    return res.redirect(`/products/${id}`);
  }
  if (product.status !== 'active') {
    req.session.flash = { type: 'error', message: '구매할 수 없는 상품입니다.' };
    return res.redirect(`/products/${id}`);
  }

  /**
   * Atomic purchase. All checks and updates run in a single transaction so
   * that concurrent requests cannot double-spend the buyer's balance or sell
   * the same product twice. Balance and product status are re-read INSIDE the
   * transaction rather than trusting the session / earlier read.
   */
  const buy = db.transaction((buyerId, sellerId, price, productId) => {
    const buyer = db.prepare('SELECT balance FROM user WHERE id = ?').get(buyerId);
    if (buyer.balance < price) throw new Error('INSUFFICIENT_FUNDS');

    const current = db.prepare('SELECT status FROM product WHERE id = ?').get(productId);
    if (!current || current.status !== 'active') throw new Error('NOT_AVAILABLE');

    db.prepare('UPDATE user SET balance = balance - ? WHERE id = ?').run(price, buyerId);
    db.prepare('UPDATE user SET balance = balance + ? WHERE id = ?').run(price, sellerId);
    db.prepare("UPDATE product SET status = 'sold' WHERE id = ?").run(productId);
    db.prepare('INSERT INTO transfer (sender_id, receiver_id, amount) VALUES (?, ?, ?)').run(
      buyerId,
      sellerId,
      price
    );
  });

  try {
    buy(req.user.id, product.seller_id, product.price, id);
    req.session.flash = {
      type: 'success',
      message: `구매가 완료되었습니다. ${product.price.toLocaleString()}원이 판매자에게 송금되었습니다.`,
    };
  } catch (err) {
    if (err.message === 'INSUFFICIENT_FUNDS') {
      req.session.flash = { type: 'error', message: '잔액이 부족합니다. 잔액을 충전해 주세요.' };
    } else if (err.message === 'NOT_AVAILABLE') {
      req.session.flash = { type: 'error', message: '이미 판매되었거나 구매할 수 없는 상품입니다.' };
    } else {
      req.session.flash = { type: 'error', message: '구매 처리 중 오류가 발생했습니다.' };
    }
  }
  res.redirect(`/products/${id}`);
});

/** Delete own product. */
router.post('/products/:id/delete', requireLogin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const product = db.prepare('SELECT * FROM product WHERE id = ?').get(id);
  if (!product) {
    return res.status(404).render('error', { title: '없음', message: '상품을 찾을 수 없습니다.' });
  }
  // Authorization: only the owner (or admin) can delete.
  if (product.seller_id !== req.user.id && !req.user.is_admin) {
    return res.status(403).render('error', { title: '거부', message: '삭제 권한이 없습니다.' });
  }
  if (product.image) {
    const filePath = path.join(config.uploadDir, path.basename(product.image));
    fs.unlink(filePath, () => {});
  }
  db.prepare('DELETE FROM product WHERE id = ?').run(id);
  req.session.flash = { type: 'success', message: '상품이 삭제되었습니다.' };
  res.redirect('/my/products');
});

module.exports = router;
