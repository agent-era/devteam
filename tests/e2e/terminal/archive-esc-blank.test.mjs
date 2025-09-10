import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

test('pressing a then ESC with one worktree returns to list (not blank)', async () => {
  const Ink = await import('../../../node_modules/ink/build/index.js');
  const {TestableApp} = await import('../../../dist/App.js');
  const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
  const {FakeTmuxService} = await import('../../../dist-tests/tests/fakes/FakeTmuxService.js');
  const {FakeGitHubService} = await import('../../../dist-tests/tests/fakes/FakeGitHubService.js');
  const {memoryStore, setupTestProject, setupTestWorktree} = await import('../../../dist-tests/tests/fakes/stores.js');

  // Seed exactly one worktree
  memoryStore.reset();
  setupTestProject('demo');
  const wt = setupTestWorktree('demo', 'feature-1');

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

  // Let initial frame render
  const {waitFor, waitForText, stripAnsi, includesWorktree} = await import('./_utils.js');
  await waitFor(() => includesWorktree(stdout.lastFrame() || '', 'demo', 'feature-1'), {timeout: 3000, interval: 50, message: 'initial feature-1 [demo] visible'});
  let frame = stdout.lastFrame() || '';

  // Press 'a' to open archive confirmation
  stdin.emit('data', Buffer.from('a'));
  await waitForText(() => stripAnsi(stdout.lastFrame() || ''), 'Archive Feature', {timeout: 3000}).catch(async () => {
    await waitForText(() => stripAnsi(stdout.lastFrame() || ''), 'Press y to confirm', {timeout: 1000});
  });
  frame = stdout.lastFrame() || '';

  // Press ESC to cancel and return to list
  stdin.emit('data', Buffer.from('\u001b'));
  await waitFor(() => includesWorktree(stdout.lastFrame() || '', 'demo', 'feature-1'), {timeout: 3000, interval: 50, message: 'worktree visible after ESC'});
  frame = stdout.lastFrame() || '';

  // Must not be blank; should show the list again with the worktree row visible
  assert.ok((frame.trim().length > 0), `Expected non-blank frame after ESC, got: ${JSON.stringify(frame)}`);
  assert.ok(includesWorktree(frame, 'demo', 'feature-1'), 'Expected to return to main list after ESC');

  try { inst.unmount?.(); } catch {}
});
