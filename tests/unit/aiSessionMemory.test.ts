import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {getLastTool, setLastTool} from '../../src/shared/utils/aiSessionMemory.js';

describe('aiSessionMemory', () => {
  let originalEnv: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    originalEnv = process.env.DEVTEAM_AI_SESSION_DIR;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devteam-ai-mem-'));
    process.env.DEVTEAM_AI_SESSION_DIR = tmpDir;
  });

  afterEach(() => {
    process.env.DEVTEAM_AI_SESSION_DIR = originalEnv;
    fs.rmSync(tmpDir, {recursive: true, force: true});
  });

  test('getLastTool is null for a fresh worktree', () => {
    expect(getLastTool('/tmp/some/worktree')).toBeNull();
  });

  test('setLastTool then getLastTool round-trips the tool name', () => {
    setLastTool('claude', '/tmp/w');
    expect(getLastTool('/tmp/w')).toBe('claude');
  });

  test('setLastTool overwrites with the most recent tool', () => {
    setLastTool('claude', '/tmp/w');
    setLastTool('codex', '/tmp/w');
    expect(getLastTool('/tmp/w')).toBe('codex');
  });

  test('different worktrees are isolated', () => {
    setLastTool('claude', '/tmp/a');
    setLastTool('codex', '/tmp/b');
    expect(getLastTool('/tmp/a')).toBe('claude');
    expect(getLastTool('/tmp/b')).toBe('codex');
  });

  test('setLastTool with "none" is a no-op', () => {
    setLastTool('none', '/tmp/x');
    expect(getLastTool('/tmp/x')).toBeNull();
  });
});
