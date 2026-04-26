#!/usr/bin/env node
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Default chalk's color level to truecolor (16M) so hex colours in markdown
// themes don't get downsampled to the user's 256-colour palette — which on
// many dark themes is desaturated and made coloured text appear dimmer than
// bold default-fg text. Honour an explicit FORCE_COLOR (incl. 0) and skip
// when the terminal is dumb / not a TTY so we don't poison non-interactive
// pipelines.
//
// Note: setting just FORCE_COLOR=3 isn't enough when TERM matches `*-256color`
// — `supports-color` v7 (used by chalk 4) hits its `-256(color)?$` branch
// before consulting the FORCE_COLOR minimum and returns level 2. Setting
// COLORTERM=truecolor short-circuits that earlier in the detection chain
// and gives us level 3. Modern terminals + tmux pass RGB escapes through.
if (process.env.TERM !== 'dumb' && process.stdout.isTTY) {
  if (process.env.FORCE_COLOR === undefined) process.env.FORCE_COLOR = '3';
  if (process.env.COLORTERM === undefined) process.env.COLORTERM = 'truecolor';
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
