import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

test('preserves page after attach/detach (selectedIndex visible)', async () => {
  // Simulate tmux attach taking over the TTY and returning
  process.env.E2E_SIMULATE_TMUX_ATTACH = '1';

  const Ink = await import('../../../node_modules/ink/build/index.js');
  const {TestableApp} = await import('../../../dist/App.js');
  const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
  const {FakeGitHubService} = await import('../../../dist-tests/tests/fakes/FakeGitHubService.js');
  const {memoryStore, setupTestProject, setupTestWorktree} = await import('../../../dist-tests/tests/fakes/stores.js');
  const {TmuxService} = await import('../../../dist/services/TmuxService.js');

  // Seed enough worktrees to have multiple pages (CapturingStdout rows=30 -> pageSize≈25)
  memoryStore.reset();
  setupTestProject('demo');
  for (let i = 1; i <= 40; i++) {
    setupTestWorktree('demo', `feature-${i}`);
  }

  // Use capturing stdout/stdin for Ink with fixed rows/cols
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
  const {waitFor, waitForText, worktreeRegex} = await import('./_utils.js');
  let frame = stdout.lastFrame() || '';
  assert.ok(frame.includes('Page 1/'), 'Expected to start on Page 1');

  // Go to Page 2 (full-page pagination)
  stdin.emit('data', Buffer.from('>'));
  await waitForText(() => stdout.lastFrame() || '', 'Page 2/', {timeout: 3000});
  // wait until a worktree label is visible on Page 2 as well
  await waitFor(() => {
    const f = stdout.lastFrame() || '';
    return worktreeRegex('demo').test(f);
  }, {timeout: 3000, interval: 50, message: 'first worktree visible on Page 2'});
  frame = stdout.lastFrame() || '';
  const firstVisibleMatch = frame.match(worktreeRegex('demo'));
  const firstVisible = firstVisibleMatch ? firstVisibleMatch[0] : '';
  assert.ok(firstVisible.length > 0, 'Expected first item on Page 2 to be detectable');

  // Select 6th item on the page (absolute index 30)
  stdin.emit('data', Buffer.from('6'));
  await new Promise(r => setTimeout(r, 100));

  // Press Enter to attach directly (no tmux hint)
  stdin.emit('data', Buffer.from('\r'));
  await waitForText(() => stdout.lastFrame() || '', 'Page 2/', {timeout: 3000});
  frame = stdout.lastFrame() || '';
  
  // After detach, we should be back on the same page and the previously first-visible item should still be visible
  assert.ok(frame.includes('Page 2/'), 'Expected to remain on Page 2 after detach');
  assert.ok(frame.includes(firstVisible), `Expected Page 2 content to include ${firstVisible} after detach`);

  try { inst.unmount?.(); } catch {}
});
