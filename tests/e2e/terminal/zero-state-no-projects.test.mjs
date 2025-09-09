import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

test('App shows NoProjectsDialog when no projects discovered', async () => {
  process.env.NO_APP_INTERVALS = '1';
  const Ink = await import('../../../node_modules/ink/build/index.js');
  const {TestableApp} = await import('../../../dist/App.js');
  const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
  const {FakeTmuxService} = await import('../../../dist-tests/tests/fakes/FakeTmuxService.js');
  const {FakeGitHubService} = await import('../../../dist-tests/tests/fakes/FakeGitHubService.js');

  // Ensure zero projects: don't seed any

  // Custom stdout/stdin to satisfy Ink raw-mode and capture frames
  const {CapturingStdout, StdinStub, installTimerGuards} = await import('./_utils.js');
  const restoreTimers = installTimerGuards();
  const stdout = new CapturingStdout();
  const stdin = new StdinStub();

  const tree = React.createElement(TestableApp, {
    gitService: new FakeGitService('/fake/projects'),
    gitHubService: new FakeGitHubService(),
    tmuxService: new FakeTmuxService()
  });
  const inst = Ink.render(tree, {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});
  try {
    await new Promise(r => setTimeout(r, 250));
  const raw = stdout.lastFrame() || '';
  const frame = raw.replace(/\u001b\[[0-9;]*m/g, ''); // strip ANSI
  assert.ok(frame.includes('No projects found'), 'Expected NoProjectsDialog title');
  assert.ok(frame.includes('has no project folders with a .git'), 'Expected NoProjectsDialog guidance');
  assert.ok(frame.includes('Press [enter] or [q] to exit'), 'Expected exit hint');
  } finally {
    try { inst.unmount?.(); } catch {}
    try { restoreTimers?.(); } catch {}
  }
});
