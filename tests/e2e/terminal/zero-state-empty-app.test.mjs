import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

test('App renders EmptyState when projects exist but no worktrees', async () => {
  process.env.NO_APP_INTERVALS = '1';
  const Ink = await import('../../../node_modules/ink/build/index.js');
  const {TestableApp} = await import('../../../dist/App.js');
  const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
  const {FakeTmuxService} = await import('../../../dist-tests/tests/fakes/FakeTmuxService.js');
  const {FakeGitHubService} = await import('../../../dist-tests/tests/fakes/FakeGitHubService.js');

  // Seed: projects exist, no worktrees
  const gitService = new FakeGitService('/fake/projects');
  gitService.addProject('demo');

  const tmuxService = new FakeTmuxService();
  const gitHubService = new FakeGitHubService();

  // Custom stdout/stdin to satisfy Ink raw-mode and capture frames
  const {CapturingStdout, StdinStub, installTimerGuards} = await import('./_utils.js');
  const restoreTimers = installTimerGuards();
  const stdout = new CapturingStdout();
  const stdin = new StdinStub();

  const tree = React.createElement(TestableApp, {gitService, gitHubService, tmuxService});
  const inst = Ink.render(tree, {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});
  try {
    await new Promise(r => setTimeout(r, 400));
  const {stripAnsi} = await import('./_utils.js');
  const raw = stdout.lastFrame() || '';
  const frame = stripAnsi(raw);
  assert.ok(frame.includes('Welcome to DevTeam'), 'Expected EmptyState welcome text');
  assert.ok(frame.includes('Press [n] to create a new branch'), 'Expected create-branch hint');
  assert.ok(frame.includes('Press [q] to quit'), 'Expected quit hint');
  } finally {
    try { inst.unmount?.(); } catch {}
    try { restoreTimers?.(); } catch {}
  }
});
