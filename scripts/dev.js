#!/usr/bin/env node
/**
 * Dev startup: loads .env, then starts nodemon with hot-reload.
 * The API is proxied to API_URL (default: http://localhost:8001).
 * Make sure crewlee-be is running first: cd ../crewlee-be && ./scripts/dev.sh
 */
require('dotenv').config({ path: '.env.local' });
const { spawn } = require('child_process');
const config = require('../config');

const API_URL = process.env.API_URL || 'http://localhost:8001';

console.log(`\n[dev] Starting ${config.project.name}...`);
console.log(`[dev] Proxying /api/* → ${API_URL}`);
console.log('[dev] Make sure crewlee-be is running on that address.\n');

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
