#!/usr/bin/env node
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Default chalk's color level to truecolor (16M) so hex colours in markdown
// themes don't get downsampled to the user's 256-colour palette — which on
// many dark themes is desaturated and made coloured text appear dimmer than
// bold default-fg text. Honour an explicit FORCE_COLOR (incl. 0) and skip
// when the terminal is dumb / not a TTY so we don't poison non-interactive
// pipelines.
if (
  process.env.FORCE_COLOR === undefined &&
  process.env.TERM !== 'dumb' &&
  process.stdout.isTTY
) {
  process.env.FORCE_COLOR = '3';
}

// Resolve project root relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

// Launch the Ink app (compiled cli.js lives at dist/cli.js)
import(path.join(root, 'cli.js')).catch((err) => {
  console.error('Failed to start DevTeam CLI:', err?.stack || err);
  process.exit(1);
});
