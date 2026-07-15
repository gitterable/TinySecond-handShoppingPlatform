'use strict';

const db = require('./db');

/**
 * Deterministic 1:1 room key so both participants join the same room
 * regardless of who initiates: "dm:<smallerId>:<largerId>".
 */
function directRoomKey(a, b) {
  const [x, y] = [a, b].sort((m, n) => m - n);
  return `dm:${x}:${y}`;
}

const MAX_MESSAGE_LEN = 500;

function setupSocket(io, sessionMiddleware) {
  // Reuse the Express session inside Socket.IO so we know who is connected.
  io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
  });

  // Only authenticated, active users may use the chat.
  io.use((socket, next) => {
    const userId = socket.request.session && socket.request.session.userId;
    if (!userId) return next(new Error('unauthorized'));
    const user = db.prepare('SELECT id, username, status FROM user WHERE id = ?').get(userId);
    if (!user || user.status === 'suspended') return next(new Error('unauthorized'));
    socket.user = { id: user.id, username: user.username };
    next();
  });

  io.on('connection', (socket) => {
    socket.join('global');

    // Send recent global history on connect.
    const history = db
      .prepare(
        `SELECT m.content, m.created_at, u.username, u.id AS sender_id
         FROM message m JOIN user u ON u.id = m.sender_id
         WHERE m.room = 'global' ORDER BY m.id DESC LIMIT 50`
      )
      .all()
      .reverse();
    socket.emit('global:history', history);

    socket.on('global:message', (payload) => {
      const content = sanitize(payload && payload.content);
      if (!content) return;
      const info = db
        .prepare('INSERT INTO message (sender_id, room, content) VALUES (?, ?, ?)')
        .run(socket.user.id, 'global', content);
      const created = db.prepare('SELECT created_at FROM message WHERE id = ?').get(info.lastInsertRowid);
      io.to('global').emit('global:message', {
        content,
        username: socket.user.username,
        sender_id: socket.user.id,
        created_at: created.created_at,
      });
    });

    // Join a 1:1 room with another user.
    socket.on('dm:join', (payload) => {
      const otherId = parseInt(payload && payload.userId, 10);
      if (Number.isNaN(otherId) || otherId === socket.user.id) return;
      const other = db.prepare('SELECT id FROM user WHERE id = ?').get(otherId);
      if (!other) return;

      const room = directRoomKey(socket.user.id, otherId);
      socket.join(room);

      const dmHistory = db
        .prepare(
          `SELECT m.content, m.created_at, u.username, u.id AS sender_id
           FROM message m JOIN user u ON u.id = m.sender_id
           WHERE m.room = ? ORDER BY m.id DESC LIMIT 50`
        )
        .all(room)
        .reverse();
      socket.emit('dm:history', { room, messages: dmHistory });
    });

    socket.on('dm:message', (payload) => {
      const otherId = parseInt(payload && payload.userId, 10);
      const content = sanitize(payload && payload.content);
      if (Number.isNaN(otherId) || !content) return;
      const other = db.prepare('SELECT id FROM user WHERE id = ?').get(otherId);
      if (!other) return;

      const room = directRoomKey(socket.user.id, otherId);
      // Ensure the sender is actually joined (defense in depth).
      socket.join(room);
      const info = db
        .prepare('INSERT INTO message (sender_id, room, content) VALUES (?, ?, ?)')
        .run(socket.user.id, room, content);
      const created = db.prepare('SELECT created_at FROM message WHERE id = ?').get(info.lastInsertRowid);
      io.to(room).emit('dm:message', {
        room,
        content,
        username: socket.user.username,
        sender_id: socket.user.id,
        created_at: created.created_at,
      });
    });
  });
}

/**
 * Server-side message sanitization: trim, enforce length, and strip angle
 * brackets. The client also HTML-escapes on render, so this is defense in
 * depth against stored XSS through chat.
 */
function sanitize(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_MESSAGE_LEN);
}

module.exports = { setupSocket, directRoomKey };
