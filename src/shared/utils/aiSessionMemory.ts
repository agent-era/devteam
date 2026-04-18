import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type {AITool} from '../../models.js';
import {ensureDirectory} from './fileSystem.js';
import {logError} from './logger.js';

// Remembers which AI tool the user most recently opened for each worktree, so Enter can
// re-open the same tool after a restart. Stored under ~/.cache/devteam/ai-sessions/
// <sha1(worktreePath)>.json; tests override DEVTEAM_AI_SESSION_DIR.

function baseDir(): string {
  return process.env.DEVTEAM_AI_SESSION_DIR
    || path.join(os.homedir(), '.cache', 'devteam', 'ai-sessions');
}

function fileFor(worktreePath: string): string {
  const key = crypto.createHash('sha1').update(worktreePath).digest('hex');
  return path.join(baseDir(), `${key}.json`);
}

export function getLastTool(worktreePath: string): AITool | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(fileFor(worktreePath), 'utf8'));
    const t = parsed?.lastTool;
    return t && t !== 'none' ? (t as AITool) : null;
  } catch {
    return null;
  }
}

export function setLastTool(tool: AITool, worktreePath: string): void {
  if (tool === 'none') return;
  try {
    ensureDirectory(baseDir());
    fs.writeFileSync(fileFor(worktreePath), JSON.stringify({lastTool: tool}), 'utf8');
  } catch (err) {
    logError('aiSessionMemory.setLastTool failed', {error: err instanceof Error ? err.message : String(err)});
  }
}
