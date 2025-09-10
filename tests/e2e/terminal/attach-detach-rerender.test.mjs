import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

test('attach then detach re-renders the main list (no blank screen)', {skip: true}, async () => {
  // Simulate tmux attach taking over the TTY and returning; also disable app intervals
  process.env.NO_APP_INTERVALS = '1';
  process.env.E2E_DISABLE_AI_TOOLS = '1';

  const Ink = await import('../../../node_modules/ink/build/index.js');
  const {TestableApp} = await import('../../../dist/App.js');
  const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
  const {FakeGitHubService} = await import('../../../dist-tests/tests/fakes/FakeGitHubService.js');
  const {FakeTmuxService} = await import('../../../dist-tests/tests/fakes/FakeTmuxService.js');

  // Seed one worktree so we can select it and attach
  const gitService = new FakeGitService('/fake/projects');
  gitService.addProject('demo');
  gitService.addWorktree('demo', 'feature-1');

  // Use capturing stdout/stdin for Ink
  const {CapturingStdout, StdinStub, waitForText, stripAnsi} = await import('./_utils.js');
  const stdout = new CapturingStdout();
  const stdin = new StdinStub();

  const tree = React.createElement(TestableApp, {
    gitService,
    gitHubService: new FakeGitHubService(),
    // Use FakeTmuxService for deterministic, fast attach/detach
    tmuxService: new FakeTmuxService()
  });

  const inst = Ink.render(tree, {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});

  // Give mount a moment, then immediately proceed to selection
  await new Promise(r => setTimeout(r, 250));
  // Debug: log the initial frame content without ANSI
  try {
    const {stripAnsi} = await import('./_utils.js');
    // eslint-disable-next-line no-console
    console.log('initial_frame=', JSON.stringify(stripAnsi(stdout.lastFrame() || '')));
  } catch {}

  // Press Enter to select; tmux hint may appear depending on environment
  stdin.emit('data', Buffer.from('\r'));
  try {
    await waitForText(() => stripAnsi(stdout.lastFrame() || ''), 'devteam uses tmux', {timeout: 1500});
    // Continue if hint is shown
    stdin.emit('data', Buffer.from('c'));
  } catch {
    // If no hint, either attached immediately or AI tool selection dialog is shown.
    // Debug current frame for visibility
    // eslint-disable-next-line no-console
    console.log('post_enter_frame=', JSON.stringify(stripAnsi(stdout.lastFrame() || '')));
    // Handle AI tool selection dialog by picking first option
    const frame = stripAnsi(stdout.lastFrame() || '');
    if (frame.includes('Select AI Tool')) {
      stdin.emit('data', Buffer.from('1'));
      // Give the hint a chance to render, then continue regardless
      await new Promise(r => setTimeout(r, 200));
      stdin.emit('data', Buffer.from('c'));
    }
  }
  // Wait for list to re-render after simulated attach/detach
  await waitForText(() => stdout.lastFrame() || '', 'demo/feature-1', {timeout: 3000});

  try { inst.unmount?.(); } catch {}
});
