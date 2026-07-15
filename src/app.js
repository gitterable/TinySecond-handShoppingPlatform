'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const config = require('./config');
require('./db'); // initialize schema + seed admin
const { loadUser } = require('./middleware/auth');
const { csrfProtection } = require('./middleware/csrf');
const { setupSocket } = require('./socket');

const app = express();
app.set('trust proxy', 1); // needed when behind ngrok / reverse proxy

// ---- View engine ----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---- Security headers (Helmet) ----
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// ---- Body parsing ----
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(express.json({ limit: '100kb' }));

// ---- Static files ----
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---- Session ----
const sessionMiddleware = session({
  name: 'sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true, // JS cannot read the cookie (mitigates XSS token theft)
    sameSite: 'lax', // mitigates CSRF
    secure: config.env === 'production', // HTTPS-only in production
    maxAge: 1000 * 60 * 60 * 2, // 2 hours
  },
});
app.use(sessionMiddleware);

// ---- Rate limiting (basic brute-force / abuse protection) ----
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.',
});
app.use(['/login', '/register'], authLimiter);

// ---- Load user + flash + CSRF for all routes ----
app.use(loadUser);
app.use((req, res, next) => {
  // Move any one-time flash message into res.locals then clear it.
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});
app.use(csrfProtection);

// ---- Home ----
app.get('/', (req, res) => {
  res.render('index', { title: '홈' });
});

// ---- Routes ----
app.use(require('./routes/auth'));
app.use(require('./routes/users'));
app.use(require('./routes/products'));
app.use(require('./routes/transfer'));
app.use(require('./routes/report'));
app.use(require('./routes/inquiry'));
app.use(require('./routes/chat'));
app.use(require('./routes/admin'));

// ---- 404 ----
app.use((req, res) => {
  res.status(404).render('error', { title: '404', message: '페이지를 찾을 수 없습니다.' });
});

// ---- Central error handler (no stack traces leaked to users) ----
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error('[ERROR]', err.message);
  const message =
    config.env === 'production' ? '서버 오류가 발생했습니다.' : `서버 오류: ${err.message}`;
  res.status(500).render('error', { title: '오류', message });
});

// ---- HTTP + Socket.IO ----
const server = http.createServer(app);
const io = new Server(server);
setupSocket(io, sessionMiddleware);

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Tiny Second-hand Shopping Platform running on http://localhost:${config.port}`);
});

module.exports = { app, server };
