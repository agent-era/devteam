import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

test('preserves page after attach/detach (selectedIndex visible)', {skip: true}, async () => {
  // Simulate tmux attach taking over the TTY and returning
  process.env.NO_APP_INTERVALS = '1';
  process.env.E2E_DISABLE_AI_TOOLS = '1';

  const Ink = await import('../../../node_modules/ink/build/index.js');
  const {TestableApp} = await import('../../../dist/App.js');
  const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
  const {FakeGitHubService} = await import('../../../dist-tests/tests/fakes/FakeGitHubService.js');
  const {FakeTmuxService} = await import('../../../dist-tests/tests/fakes/FakeTmuxService.js');

  // Seed enough worktrees to have multiple pages (CapturingStdout rows=30 -> pageSize≈25)
  const gitService = new FakeGitService('/fake/projects');
  gitService.addProject('demo');
  for (let i = 1; i <= 40; i++) {
    gitService.addWorktree('demo', `feature-${i}`);
  }

  // Use capturing stdout/stdin for Ink with fixed rows/cols
  const {CapturingStdout, StdinStub, installTimerGuards, waitForText, stripAnsi} = await import('./_utils.js');
  const stdout = new CapturingStdout();
  const stdin = new StdinStub();
  const restoreTimers = installTimerGuards();

  const tree = React.createElement(TestableApp, {
    gitService,
    gitHubService: new FakeGitHubService(),
    // Use FakeTmuxService for deterministic attach/detach
    tmuxService: new FakeTmuxService()
  });

  const inst = Ink.render(tree, {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});

  // Allow initial frame to render (poll for stability)
  await new Promise(r => setTimeout(r, 250));
  await waitForText(() => stdout.lastFrame() || '', 'Page 1/', {timeout: 3000});

  // Navigate forward until feature-26 becomes visible (half-page steps)
  for (let i = 0; i < 10; i++) {
    const visible = (stdout.lastFrame() || '').includes('demo/feature-26');
    if (visible) break;
    stdin.emit('data', Buffer.from('>'));
    await new Promise(r => setTimeout(r, 50));
  }
  await waitForText(() => stdout.lastFrame() || '', 'demo/feature-26', {timeout: 3000});

  // Select 6th item on the page (absolute index 30)
  stdin.emit('data', Buffer.from('6'));
  await new Promise(r => setTimeout(r, 100));

  // Press Enter to attach; hint may or may not appear
  stdin.emit('data', Buffer.from('\r'));
  try {
    await waitForText(() => stripAnsi(stdout.lastFrame() || ''), 'devteam uses tmux', {timeout: 1500});
    // Continue from hint
    stdin.emit('data', Buffer.from('c'));
  } catch {
    // No hint; proceed
  }
  await waitForText(() => stdout.lastFrame() || '', 'demo/feature-26', {timeout: 3000});

  try { inst.unmount?.(); } catch {}
  try { restoreTimers?.(); } catch {}
});
