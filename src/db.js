'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const config = require('./config');

// Ensure the data directory exists before opening the database file.
const dataDir = path.dirname(config.dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(config.dbPath);

// Pragmas: WAL for better concurrency, foreign keys ON for integrity.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Create the schema if it does not exist.
 *
 * Design (from assignment spec):
 *  - user:    id, username, password_hash, bio, balance, is_admin, status
 *  - product: id, name, description, price, image, seller_id, status
 *  - report:  id, reporter_id, target_type, target_id, reason
 *  - message: chat messages (global + 1:1)
 *  - transfer: money transfer ledger between users
 */
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      bio           TEXT    NOT NULL DEFAULT '',
      balance       INTEGER NOT NULL DEFAULT 0,
      is_admin      INTEGER NOT NULL DEFAULT 0,
      status        TEXT    NOT NULL DEFAULT 'active', -- active | suspended
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      price       INTEGER NOT NULL,
      image       TEXT,
      seller_id   INTEGER NOT NULL,
      status      TEXT    NOT NULL DEFAULT 'active', -- active | blocked | sold
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (seller_id) REFERENCES user(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS report (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id INTEGER NOT NULL,
      target_type TEXT    NOT NULL, -- 'user' | 'product'
      target_id   INTEGER NOT NULL,
      reason      TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (reporter_id) REFERENCES user(id) ON DELETE CASCADE,
      UNIQUE (reporter_id, target_type, target_id) -- one report per target per user
    );

    CREATE TABLE IF NOT EXISTS message (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id   INTEGER NOT NULL,
      room        TEXT    NOT NULL, -- 'global' or a deterministic 1:1 room key
      content     TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (sender_id) REFERENCES user(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transfer (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id   INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      amount      INTEGER NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (sender_id)   REFERENCES user(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES user(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inquiry (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      subject     TEXT    NOT NULL,
      content     TEXT    NOT NULL,
      answer      TEXT,
      status      TEXT    NOT NULL DEFAULT 'open', -- open | answered
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      answered_at TEXT,
      FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_product_seller ON product(seller_id);
    CREATE INDEX IF NOT EXISTS idx_inquiry_user ON inquiry(user_id);
    CREATE INDEX IF NOT EXISTS idx_message_room ON message(room);
    CREATE INDEX IF NOT EXISTS idx_report_target ON report(target_type, target_id);
  `);
}

/**
 * Seed a default admin account if none exists.
 * The password is hashed – never stored in plaintext.
 */
function seedAdmin() {
  const existing = db.prepare('SELECT id FROM user WHERE username = ?').get(config.admin.username);
  if (!existing) {
    const hash = bcrypt.hashSync(config.admin.password, config.bcryptRounds);
    db.prepare(
      'INSERT INTO user (username, password_hash, bio, balance, is_admin) VALUES (?, ?, ?, ?, 1)'
    ).run(config.admin.username, hash, 'Platform administrator', 0);
    // eslint-disable-next-line no-console
    console.log(`[DB] Seeded admin account "${config.admin.username}".`);
  }
}

initSchema();
seedAdmin();

module.exports = db;

// Allow running `npm run init-db` directly.
if (require.main === module) {
  // eslint-disable-next-line no-console
  console.log('[DB] Schema initialized at', config.dbPath);
}
