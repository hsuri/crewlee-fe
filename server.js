require('dotenv').config({ path: '.env.local' });
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const config = require('./config');

const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = process.env.API_URL || 'http://localhost:8001';

// Proxy all /api/* requests to the backend service
app.use('/api', createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  logLevel: 'warn',
  onError: (err, req, res) => {
    console.error('[proxy] Backend unreachable:', err.message);
    res.status(502).json({ error: 'Backend unavailable' });
  },
}));

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[server] ${config.project.name} on port ${PORT} → API: ${API_URL}`);
});
