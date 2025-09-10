import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

test('full App renders list rows with fakes', async () => {
  process.env.NO_APP_INTERVALS = '1';
  const Ink = await import('../../../node_modules/ink/build/index.js');
  const {TestableApp} = await import('../../../dist/App.js');
  const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
  const {FakeTmuxService} = await import('../../../dist-tests/tests/fakes/FakeTmuxService.js');
  const {FakeGitHubService} = await import('../../../dist-tests/tests/fakes/FakeGitHubService.js');

  // Seed fakes using instance fields
  const gitService = new FakeGitService('/fake/projects');
  gitService.addProject('demo');
  const wt1 = gitService.addWorktree('demo', 'feature-1');
  gitService.setGitStatus(wt1.path, {ahead: 1, base_added_lines: 5});
  gitService.addWorktree('demo', 'feature-2');
  const gitHubService = new FakeGitHubService();
  gitHubService.setPRStatus(wt1.path, {number: 123, state: 'OPEN', checks: 'passing'});
  const tmuxService = new FakeTmuxService();

  // Custom stdout/stdin to satisfy Ink raw-mode and capture frames
  const {CapturingStdout, StdinStub, installTimerGuards} = await import('./_utils.js');
  const restoreTimers = installTimerGuards();
  const stdout = new CapturingStdout();
  const stdin = new StdinStub();

  const tree = React.createElement(TestableApp, {gitService, gitHubService, tmuxService});
  const inst = Ink.render(tree, {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});
  try {
    const {waitFor, includesWorktree} = await import('./_utils.js');
    await waitFor(() => includesWorktree(stdout.lastFrame() || '', 'demo', 'feature-1'), {timeout: 3000, interval: 50, message: 'feature-1 [demo] visible'});
    await waitFor(() => includesWorktree(stdout.lastFrame() || '', 'demo', 'feature-2'), {timeout: 3000, interval: 50, message: 'feature-2 [demo] visible'});
  } finally {
    try { inst.unmount?.(); } catch {}
    try { restoreTimers?.(); } catch {}
  }
});
