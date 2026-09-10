require('dotenv').config({ path: '.env.local' });
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const QRCode = require('qrcode');
const config = require('./config');

const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = process.env.API_URL || 'http://localhost:8001';

// Cloud Run terminates TLS at the edge and forwards plain HTTP, so without this req.protocol
// would always report 'http' -- which would make the Guest AI QR code below encode an
// http:// URL instead of https://. Also makes req.ip/X-Forwarded-For correct generally.
app.set('trust proxy', true);

// Proxy all /api/* requests to the backend service. xfwd adds X-Forwarded-For/-Proto/-Host so
// crewlee-be can see the guest's real IP (its Guest AI rate limiter keys on it) instead of
// this server's -- without it, every guest request would look like it came from one IP.
app.use('/api', createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  xfwd: true,
  logLevel: 'warn',
  onError: (err, req, res) => {
    console.error('[proxy] Backend unreachable:', err.message);
    res.status(502).json({ error: 'Backend unavailable' });
  },
}));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'admin.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'login.html'));
});

// Each tab in app.html (dashboard, schedule, announcements, rag, guestai, settings) is its
// own real route so a refresh keeps the user on the page they were looking at, rather than
// bouncing back to a default tab. All of them serve the same shell; app.js reads the
// path on load to decide which panel to show (see switchToPanel/panelFromPath).
app.get(['/app', '/app/dashboard', '/app/schedule', '/app/announcements', '/app/rag', '/app/guestai', '/app/settings'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'app.html'));
});

// Public, unauthenticated Guest AI chat -- the page a customer reaches by scanning the
// restaurant's QR code. guest.js resolves `:slug` from location.pathname client-side and
// calls the backend's public /api/guest/{slug}* routes directly; no session/token involved.
app.get('/guest/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'guest.html'));
});

// Server-rendered QR PNG for a restaurant's Guest AI URL -- generated on the fly (not stored)
// so it's always in sync with the slug and never goes stale; ETag-able and cheap enough
// (~ms) not to need caching beyond the browser's own Cache-Control honoring.
app.get('/guest/:slug/qr.png', async (req, res) => {
  const guestUrl = `${req.protocol}://${req.get('host')}/guest/${req.params.slug}`;
  try {
    const png = await QRCode.toBuffer(guestUrl, { type: 'png', width: 1024, margin: 2 });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(png);
  } catch (err) {
    console.error('[qr] Failed to generate QR code:', err.message);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[server] ${config.project.name} on port ${PORT} → API: ${API_URL}`);
});
