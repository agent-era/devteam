#!/usr/bin/env node
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Resolve project root relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

// Launch the Ink app (compiled cli.js lives at dist/cli.js)
import(path.join(root, 'cli.js')).catch((err) => {
  console.error('Failed to start DevTeam CLI:', err?.stack || err);
  process.exit(1);
});
