#!/usr/bin/env node
// devteam-status-hook
//
// Invoked by Claude Code, Gemini CLI, and OpenAI Codex via their hook systems.
// Usage (configured in each CLI's settings):
//   node devteam-status-hook.mjs <tool> <event>
//
// Reads the hook event JSON from stdin, walks up from cwd to locate a
// `.devteam-session` marker file, and writes/clears the status file at
// ~/.devteam/status/<session>.json. Silently exits on unrelated invocations.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MARKER_FILE = '.devteam-session';
const STATUS_DIR = path.join(os.homedir(), '.devteam', 'status');

try { fs.mkdirSync(STATUS_DIR, {recursive: true}); } catch {}

const [toolArg, eventArg] = process.argv.slice(2);
const tool = (toolArg || 'unknown').toLowerCase();
const event = eventArg || '';

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

function parseJSON(text) {
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}

function findMarker(startCwd) {
  let dir;
  try { dir = fs.realpathSync(startCwd); } catch { dir = startCwd; }
  if (!dir) return null;
  while (dir && dir !== path.dirname(dir)) {
    const marker = path.join(dir, MARKER_FILE);
    if (fs.existsSync(marker)) {
      try { return { marker: JSON.parse(fs.readFileSync(marker, 'utf8')), markerDir: dir }; } catch { return null; }
    }
    dir = path.dirname(dir);
  }
  return null;
}

// Map (tool, event, payload) to an AI status value.
// Returns 'working' | 'waiting' | 'idle' | '__delete__' | null.
function mapStatus(tool, event, payload) {
  const e = event;

  // SessionEnd always clears the status file
  if (e === 'SessionEnd') return '__delete__';

  // Turn-complete / idle
  if (e === 'Stop' || e === 'AfterAgent' || e === 'agent-turn-complete') return 'idle';

  // Codex fires PreToolUse before blocking for user approval — treat as waiting
  if (e === 'PreToolUse' && tool === 'codex') return 'waiting';

  // Actively working
  if (
    e === 'UserPromptSubmit' ||
    e === 'PreToolUse' ||
    e === 'BeforeAgent' ||
    e === 'BeforeModel' ||
    e === 'BeforeTool'
  ) return 'working';

  // Waiting for user (permission, idle prompt, approval)
  if (e === 'approval-requested') return 'waiting';
  if (e === 'Notification') {
    const t = payload.notification_type || '';
    if (t === 'permission_prompt' || t === 'idle_prompt' || t === 'ToolPermission') return 'waiting';
    return null;
  }

  // SessionStart: tool just opened — mark as idle so the UI shows it as running
  if (e === 'SessionStart') return 'idle';

  return null;
}

function writeStatusFile(sessionName, body) {
  const target = path.join(STATUS_DIR, `${sessionName}.json`);
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(body));
    fs.renameSync(tmp, target);
  } catch {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

function removeStatusFile(sessionName) {
  try { fs.unlinkSync(path.join(STATUS_DIR, `${sessionName}.json`)); } catch {}
}

async function main() {
  const stdin = await readStdin();
  const payload = parseJSON(stdin);
  const cwd = payload.cwd || process.cwd();
  const found = findMarker(cwd);
  if (!found || !found.marker?.session) return; // not a devteam worktree — silently ignore

  const status = mapStatus(tool, event, payload);
  if (!status) return;

  if (status === '__delete__') { removeStatusFile(found.marker.session); return; }

  writeStatusFile(found.marker.session, {
    v: 1,
    tool,
    status,
    event,
    ts: Date.now(),
    session: found.marker.session,
    project: found.marker.project || null,
    feature: found.marker.feature || null,
    cli_session_id: payload.session_id || null,
    cwd,
  });
}

main().catch(() => {
  // Hooks must never surface errors to the user — fail silently.
});
