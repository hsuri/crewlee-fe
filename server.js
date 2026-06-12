require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const path = require('path');
const config = require('./config');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Database ─────────────────────────────────────────────────────────────────

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

async function initDb() {
  if (!pool) { console.warn('[db] No DATABASE_URL — skipping init'); return; }

  // Build CREATE TABLE from config.database.fields
  const colDefs = config.database.fields.map(f => {
    const notNull = f.required ? 'NOT NULL' : '';
    return `  ${f.name} text ${notNull}`.trim();
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${config.database.table} (
      id         SERIAL PRIMARY KEY,
      ${colDefs.join(',\n      ')},
      created_at timestamptz DEFAULT now()
    )
  `);
  console.log(`[db] Table '${config.database.table}' ready`);
}

// ─── Email ────────────────────────────────────────────────────────────────────

let _mailer = null;

async function getMailer() {
  if (_mailer) return _mailer;
  if (process.env.SMTP_HOST) {
    _mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  } else {
    const test = await nodemailer.createTestAccount();
    _mailer = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: { user: test.user, pass: test.pass },
    });
    console.log('[email] No SMTP configured — using Ethereal test account');
  }
  return _mailer;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Routes ───────────────────────────────────────────────────────────────────

// Non-sensitive config for the frontend
app.get('/api/config/public', (req, res) => {
  res.json({
    project: config.project,
    branding: config.branding,
    copy: config.copy || {},
    nav: config.nav || {},
    footer: config.footer || {},
    fields: config.database.fields,
  });
});

// Waitlist signup
app.post('/api/waitlist', async (req, res) => {
  const fields = config.database.fields;
  const colNames = [];
  const values = [];
  const placeholders = [];

  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const val = req.body[f.name];
    if (f.required && !val) {
      return res.status(400).json({ error: `${f.label} is required` });
    }
    colNames.push(f.name);
    values.push(val || null);
    placeholders.push(`$${i + 1}`);
  }

  let signupId = null;

  if (pool) {
    try {
      const result = await pool.query(
        `INSERT INTO ${config.database.table} (${colNames.join(', ')})
         VALUES (${placeholders.join(', ')}) RETURNING id`,
        values
      );
      signupId = result.rows[0].id;
    } catch (err) {
      console.error('[db] Insert error:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
  }

  // Notify founders
  try {
    const mailer = await getMailer();
    const from = process.env.EMAIL_FROM || config.email.from;
    const to = (
      process.env.NOTIFY_EMAIL
        ? [process.env.NOTIFY_EMAIL, process.env.NOTIFY_EMAIL_2].filter(Boolean)
        : config.email.notifyEmails
    ).join(', ');

    const fieldSummary = fields
      .map(f => `${f.label}: ${req.body[f.name] || '-'}`)
      .join('\n');

    const info = await mailer.sendMail({
      from: `"${config.project.name}" <${from}>`,
      to,
      subject: `New waitlist signup${signupId ? ` #${signupId}` : ''}`,
      text: `New signup!\n\n${fieldSummary}\n\nJoined: ${new Date().toISOString()}`,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) console.log('[email] Preview:', previewUrl);
  } catch (emailErr) {
    console.error('[email] Notification failed:', emailErr.message);
    // Don't fail the request over email
  }

  res.json({ success: true, id: signupId });
});

// Admin auth
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const correct = process.env.ADMIN_PASSWORD || 'admin123';
  if (password === correct) {
    res.json({ token: correct });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || token !== (process.env.ADMIN_PASSWORD || 'admin123')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Get all waitlist entries
app.get('/api/waitlist', requireAuth, async (req, res) => {
  if (!pool) return res.json([]);
  try {
    const result = await pool.query(
      `SELECT * FROM ${config.database.table} ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[db] Query error:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Serve SPA for non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function start() {
  await initDb().catch(err => console.warn('[db] Init failed:', err.message));
  app.listen(PORT, () => console.log(`[server] ${config.project.name} running on port ${PORT}`));
}

start();
