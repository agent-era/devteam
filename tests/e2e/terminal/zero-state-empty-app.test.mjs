import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';

// The kanban board is now the app's default view on startup (when any project
// exists). This test asserts the startup routing: projects exist, no worktrees →
// tracker board for the first project, not the worktree-list empty state.
test('App lands on the tracker board when projects exist with no worktrees', async () => {
  process.env.NO_APP_INTERVALS = '1';
  process.env.E2E_IGNORE_RAWMODE = '1';

  const Ink = await import('../../../node_modules/ink/build/index.js');
  const {TestableApp} = await import('../../../dist/App.js');
  const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
  const {FakeTmuxService} = await import('../../../dist-tests/tests/fakes/FakeTmuxService.js');
  const {FakeGitHubService} = await import('../../../dist-tests/tests/fakes/FakeGitHubService.js');
  const {memoryStore} = await import('../../../dist-tests/tests/fakes/stores.js');

  memoryStore.reset();

  // Real tmp path so TrackerService can create tracker/index.json under it.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devteam-zero-'));

  const gitService = new FakeGitService('/fake/projects');
  gitService.addProject('demo', tmpDir);
  const tmuxService = new FakeTmuxService();
  const gitHubService = new FakeGitHubService();

  const {CapturingStdout, StdinStub, installTimerGuards, waitFor, stripAnsi} = await import('./_utils.js');
  const restoreTimers = installTimerGuards();
  const stdout = new CapturingStdout();
  const stdin = new StdinStub();

  const tree = React.createElement(TestableApp, {gitService, gitHubService, tmuxService});
  const inst = Ink.render(tree, {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});
  try {
    await waitFor(() => {
      const f = stripAnsi(stdout.lastFrame() || '');
      return f.includes('Discovery') && f.includes('Implement');
    }, {timeout: 3000, interval: 50, message: 'tracker board visible on startup'});

    const frame = stripAnsi(stdout.lastFrame() || '');
    assert.ok(frame.includes('demo'), 'Expected project name in tracker title bar');
    assert.ok(frame.includes('Discovery'), 'Expected Discovery column');
    assert.ok(frame.includes('Requirements'), 'Expected Requirements column');
    // With no items, columns render an "(empty)" placeholder somewhere.
    assert.ok(frame.includes('(empty)'), 'Expected empty-column placeholder');
    // The previous zero-state EmptyState belongs to MainView; it should NOT appear
    // here since startup routes to the tracker.
    assert.ok(!frame.includes('Welcome to DevTeam'), 'MainView EmptyState should not appear on startup');
  } finally {
    try { inst.unmount?.(); } catch {}
    try { fs.rmSync(tmpDir, {recursive: true, force: true}); } catch {}
    try { restoreTimers?.(); } catch {}
  }
});
