import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorktreeCore} from '../../src/cores/WorktreeCore.js';
import {WorktreeInfo, SessionInfo} from '../../src/models.js';
import {FakeGitService} from '../fakes/FakeGitService.js';
import {FakeTmuxService} from '../fakes/FakeTmuxService.js';
import {getLastTool, setLastTool} from '../../src/shared/utils/aiSessionMemory.js';
import {setupTestProject, setupTestWorktree, memoryStore} from '../fakes/stores.js';

function buildCore() {
  const git = new FakeGitService();
  const tmux = new FakeTmuxService();
  const core = new WorktreeCore({git, tmux} as any);
  // Override detected tools so tests don't depend on the developer's PATH.
  (core as any).availableAITools = ['claude', 'codex'];
  return {core, tmux};
}

function worktreeFor(project: string, feature: string): WorktreeInfo {
  setupTestProject(project);
  const wt = setupTestWorktree(project, feature);
  wt.session = new SessionInfo({ai_tool: 'none', ai_status: 'not_running'});
  return wt;
}

function getExecutedCommands(tmux: FakeTmuxService, sessionName: string): string[] {
  return tmux.getSentKeys(sessionName)
    .filter(keys => (keys[0] === 'command' && typeof keys[1] === 'string') || keys[keys.length - 1] === 'C-m')
    .map(keys => keys[0] === 'command' ? keys[1] : keys[0]);
}

describe('WorktreeCore auto-resume', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    memoryStore.reset();
    originalEnv = process.env.DEVTEAM_AI_SESSION_DIR;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devteam-core-resume-'));
    process.env.DEVTEAM_AI_SESSION_DIR = tmpDir;
  });

  afterEach(() => {
    process.env.DEVTEAM_AI_SESSION_DIR = originalEnv;
    fs.rmSync(tmpDir, {recursive: true, force: true});
  });

  test('attachSession to an existing worktree resumes claude with a fresh-launch fallback and records lastTool', async () => {
    const {core, tmux} = buildCore();
    const wt = worktreeFor('proj', 'feat');

    await core.attachSession(wt, 'claude');

    const sessionName = tmux.sessionName('proj', 'feat');
    expect(getExecutedCommands(tmux, sessionName)).toEqual([
      `claude --continue -n 'feat - proj' || claude -n 'feat - proj'`,
    ]);
    expect(getLastTool(wt.path)).toBe('claude');
  });

  test('attachSession with freshWorktree=true launches claude without --continue', async () => {
    const {core, tmux} = buildCore();
    const wt = worktreeFor('proj', 'feat');

    await core.attachSession(wt, 'claude', undefined, {freshWorktree: true});

    const sessionName = tmux.sessionName('proj', 'feat');
    expect(getExecutedCommands(tmux, sessionName)).toEqual([`claude -n 'feat - proj'`]);
  });

  test('attachSession with freshWorktree=true launches codex without resume --last', async () => {
    const {core, tmux} = buildCore();
    const wt = worktreeFor('proj', 'feat');

    await core.attachSession(wt, 'codex', undefined, {freshWorktree: true});

    const sessionName = tmux.sessionName('proj', 'feat');
    expect(getExecutedCommands(tmux, sessionName)).toEqual(['codex']);
  });

  test('attachSession uses remembered tool when no explicit choice and chains a fresh-launch fallback', async () => {
    const {core, tmux} = buildCore();
    const wt = worktreeFor('proj', 'feat');
    setLastTool('codex', wt.path);

    await core.attachSession(wt);

    const sessionName = tmux.sessionName('proj', 'feat');
    expect(getExecutedCommands(tmux, sessionName)).toEqual(['codex resume --last || codex']);
  });

  test('switching to claude on a worktree previously used with codex still chains the fresh-launch fallback', async () => {
    const {core, tmux} = buildCore();
    const wt = worktreeFor('proj', 'feat');
    // Simulate a worktree that was previously running codex.
    setLastTool('codex', wt.path);

    // Now the user explicitly picks claude — no fresh-worktree flag, since the
    // worktree directory already exists.
    await core.attachSession(wt, 'claude');

    const sessionName = tmux.sessionName('proj', 'feat');
    expect(getExecutedCommands(tmux, sessionName)).toEqual([
      `claude --continue -n 'feat - proj' || claude -n 'feat - proj'`,
    ]);
    expect(getLastTool(wt.path)).toBe('claude');
  });

  test('attachSession with existing tmux session does not re-spawn the tool', async () => {
    const {core, tmux} = buildCore();
    const wt = worktreeFor('proj', 'feat');
    setLastTool('claude', wt.path);
    const sessionName = tmux.sessionName('proj', 'feat');
    // Pre-create the tmux session.
    tmux.createSessionWithCommand(sessionName, wt.path, 'claude --continue', true);
    const before = tmux.getSentKeys(sessionName).filter(k => k[0] === 'command').length;

    await core.attachSession(wt);

    const after = tmux.getSentKeys(sessionName).filter(k => k[0] === 'command').length;
    expect(after).toBe(before);
  });

  test('needsToolSelection returns false when a tool is remembered for this worktree', async () => {
    const {core} = buildCore();
    const wt = worktreeFor('proj', 'feat');
    expect(await core.needsToolSelection(wt)).toBe(true); // two tools available, no memory
    setLastTool('codex', wt.path);
    expect(await core.needsToolSelection(wt)).toBe(false); // memory short-circuits the picker
  });
});
