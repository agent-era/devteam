import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';

test('attach then detach re-renders the main list (no blank screen)', async () => {
  // Simulate tmux attach taking over the TTY and returning
  process.env.E2E_SIMULATE_TMUX_ATTACH = '1';
  process.env.E2E_IGNORE_RAWMODE = '1';

  const Ink = await import('../../../node_modules/ink/build/index.js');
  const {TestableApp} = await import('../../../dist/App.js');
  const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
  const {FakeGitHubService} = await import('../../../dist-tests/tests/fakes/FakeGitHubService.js');
  const {memoryStore, setupTestProject, setupTestWorktree} = await import('../../../dist-tests/tests/fakes/stores.js');
  const {TmuxService} = await import('../../../dist/services/TmuxService.js');

  // Real tmp path so the tracker (default startup view) can materialise its index.
  const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'devteam-attach-'));

  // Seed one worktree so we can select it and attach
  memoryStore.reset();
  setupTestProject('demo', tmpProject);
  setupTestWorktree('demo', 'feature-1');

  // Use capturing stdout/stdin for Ink
  const {CapturingStdout, StdinStub} = await import('./_utils.js');
  const stdout = new CapturingStdout();
  const stdin = new StdinStub();

  const tree = React.createElement(TestableApp, {
    gitService: new FakeGitService('/fake/projects'),
    gitHubService: new FakeGitHubService(),
    // Use real TmuxService so it calls runInteractive (which we simulate)
    tmuxService: new TmuxService()
  });

  const inst = Ink.render(tree, {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});

  const {waitFor, includesWorktree, stripAnsi} = await import('./_utils.js');

  // Startup routes to the tracker board; press `t` to toggle over to MainView.
  await waitFor(() => stripAnsi(stdout.lastFrame() || '').includes('Discovery'),
    {timeout: 3000, interval: 50, message: 'tracker visible on startup'});
  await waitFor(() => {
    stdin.emit('data', Buffer.from('t'));
    return includesWorktree(stdout.lastFrame() || '', 'demo', 'feature-1');
  }, {timeout: 3000, interval: 50, message: 'feature-1 [demo] visible before attach'});
  let frame = stdout.lastFrame() || '';

  // Press Enter to select -> directly attach (simulated)
  stdin.emit('data', Buffer.from('\r'));
  // Wait for simulated attach/detach cycle and redraw
  await waitFor(() => includesWorktree(stdout.lastFrame() || '', 'demo', 'feature-1'),
    {timeout: 3000, interval: 50, message: 'feature-1 [demo] visible after detach'});

  try { inst.unmount?.(); } catch {}
  try { fs.rmSync(tmpProject, {recursive: true, force: true}); } catch {}
});
