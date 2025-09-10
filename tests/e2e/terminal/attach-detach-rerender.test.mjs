import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

test('attach then detach re-renders the main list (no blank screen)', async () => {
  // Simulate tmux attach taking over the TTY and returning
  process.env.E2E_SIMULATE_TMUX_ATTACH = '1';

  const Ink = await import('../../../node_modules/ink/build/index.js');
  const {TestableApp} = await import('../../../dist/App.js');
  const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
  const {FakeGitHubService} = await import('../../../dist-tests/tests/fakes/FakeGitHubService.js');
  const {memoryStore, setupTestProject, setupTestWorktree} = await import('../../../dist-tests/tests/fakes/stores.js');
  const {TmuxService} = await import('../../../dist/services/TmuxService.js');

  // Seed one worktree so we can select it and attach
  memoryStore.reset();
  setupTestProject('demo');
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

  // Allow initial frame to render
  await new Promise(r => setTimeout(r, 250));
  let frame = stdout.lastFrame() || '';
  assert.ok(frame.includes('demo/feature-1'), 'Expected initial list with single worktree');

  // Press Enter to select -> directly attach (simulated)
  stdin.emit('data', Buffer.from('\r'));
  await new Promise(r => setTimeout(r, 300));
  // Give a moment for simulated attach/detach and redraw
  frame = stdout.lastFrame() || '';

  // After detach, screen should re-render main list (not stay blank)
  assert.ok(frame.trim().length > 0, 'Expected non-blank frame after detach');
  assert.ok(frame.includes('demo/feature-1'), 'Expected to return to list after detach');

  try { inst.unmount?.(); } catch {}
});
