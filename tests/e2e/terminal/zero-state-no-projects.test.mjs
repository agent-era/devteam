import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

test('App shows NoProjectsDialog when no projects discovered', async () => {
  const Ink = await import('../../../node_modules/ink/build/index.js');
  const {TestableApp} = await import('../../../dist/App.js');
  const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
  const {FakeTmuxService} = await import('../../../dist-tests/tests/fakes/FakeTmuxService.js');
  const {FakeGitHubService} = await import('../../../dist-tests/tests/fakes/FakeGitHubService.js');
  const {memoryStore} = await import('../../../dist-tests/tests/fakes/stores.js');

  // Ensure zero projects
  memoryStore.reset();

  // Custom stdout/stdin to satisfy Ink raw-mode and capture frames
  const {CapturingStdout, StdinStub} = await import('./_utils.js');
  const stdout = new CapturingStdout();
  const stdin = new StdinStub();

  const tree = React.createElement(TestableApp, {
    gitService: new FakeGitService('/fake/projects'),
    gitHubService: new FakeGitHubService(),
    tmuxService: new FakeTmuxService()
  });
  const inst = Ink.render(tree, {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});
  await new Promise(r => setTimeout(r, 200));
  const frame = stdout.lastFrame() || '';
  assert.ok(frame.includes('No projects found'), 'Expected NoProjectsDialog title');
  assert.ok(frame.includes('has no project folders with a .git'), 'Expected NoProjectsDialog guidance');
  assert.ok(frame.includes('Press [enter] or [q] to exit'), 'Expected exit hint');
  try { inst.unmount?.(); } catch {}
});
