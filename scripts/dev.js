#!/usr/bin/env node
/**
 * Smart dev startup.
 * - Reads DATABASE_URL from .env (or uses default from config)
 * - If Postgres isn't reachable, tries to start it via Docker Compose
 * - Retries up to 30s, then starts the server without DB if still unavailable
 * - Launches nodemon for hot-reload
 */
require('dotenv').config();
const { execSync, spawn } = require('child_process');
const net = require('net');
const config = require('../config');

const dbSlug = config.database.name;
const DB_URL = process.env.DATABASE_URL || `postgres://postgres:postgres@localhost:5432/${dbSlug}`;

function parseHost(url) {
  try {
    const u = new URL(url);
    return { host: u.hostname || 'localhost', port: parseInt(u.port || '5432') };
  } catch {
    return { host: 'localhost', port: 5432 };
  }
}

function checkPort(host, port) {
  return new Promise(resolve => {
    const s = net.createConnection({ host, port });
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    s.setTimeout(800, () => { s.destroy(); resolve(false); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function startServer() {
  console.log(`\n[dev] Starting ${config.project.name} with nodemon...\n`);
  const proc = spawn(
    'node_modules/.bin/nodemon',
    ['server.js'],
    { stdio: 'inherit', cwd: process.cwd() }
  );
  proc.on('error', err => {
    if (err.code === 'ENOENT') {
      console.error('[dev] nodemon not found — run: npm install');
    } else {
      console.error('[dev]', err.message);
    }
    process.exit(1);
  });
}

async function main() {
  const { host, port } = parseHost(DB_URL);

  // Skip if using Cloud SQL socket
  if (DB_URL.includes('/cloudsql/')) {
    console.log('[dev] Cloud SQL socket URL detected — skipping local DB check');
    startServer();
    return;
  }

  console.log(`[dev] Checking Postgres at ${host}:${port}...`);
  const ok = await checkPort(host, port);

  if (ok) {
    console.log('[dev] Postgres is up.');
    startServer();
    return;
  }

  console.log('[dev] Postgres not reachable. Trying Docker Compose...');

  let dockerAvailable = false;
  try {
    execSync('docker info', { stdio: 'ignore' });
    dockerAvailable = true;
  } catch {
    console.warn('[dev] Docker not running — skipping Docker Compose start');
  }

  if (dockerAvailable) {
    try {
      execSync('docker compose up -d db', { stdio: 'inherit' });
    } catch {
      try {
        execSync('docker-compose up -d db', { stdio: 'inherit' });
      } catch {
        console.warn('[dev] Could not start Docker Compose DB');
      }
    }
  }

  console.log('[dev] Waiting for Postgres (up to 30s)...');
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    if (await checkPort(host, port)) {
      console.log('[dev] Postgres is up.');
      startServer();
      return;
    }
    process.stdout.write('.');
  }

  console.log('\n[dev] Postgres still unavailable — starting server without DB.');
  startServer();
}

main();
