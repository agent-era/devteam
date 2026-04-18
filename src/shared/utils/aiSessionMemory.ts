import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type {AITool} from '../../models.js';
import {logError} from './logger.js';

// Remembers which AI tool the user most recently opened for each worktree, so Enter can
// re-open the same tool after a restart. Stored under ~/.cache/coding-agent-team/
// ai-sessions/<sha1(worktreePath)>.json; tests override DEVTEAM_AI_SESSION_DIR.

function baseDir(): string {
  return process.env.DEVTEAM_AI_SESSION_DIR
    || path.join(os.homedir(), '.cache', 'coding-agent-team', 'ai-sessions');
}

function fileFor(worktreePath: string): string {
  const key = crypto.createHash('sha1').update(worktreePath).digest('hex');
  return path.join(baseDir(), `${key}.json`);
}

export function getLastTool(worktreePath: string): AITool | null {
  try {
    const p = fileFor(worktreePath);
    if (!fs.existsSync(p)) return null;
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    const t = parsed?.lastTool;
    return t && t !== 'none' ? (t as AITool) : null;
  } catch {
    return null;
  }
}

export function setLastTool(tool: AITool, worktreePath: string): void {
  if (tool === 'none') return;
  try {
    const dir = baseDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(fileFor(worktreePath), JSON.stringify({lastTool: tool}), 'utf8');
  } catch (err) {
    logError('aiSessionMemory.setLastTool failed', {error: err instanceof Error ? err.message : String(err)});
  }
}
