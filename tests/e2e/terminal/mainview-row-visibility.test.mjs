import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';

// Prevent TTY raw mode errors in test environment
process.env.E2E_IGNORE_RAWMODE = '1';

const COMBOS = [
  [10, 80], [11, 80], [12, 80], [13, 80], [15, 80], [20, 80], [24, 80],
  [10, 96], [11, 96], [12, 96], [13, 96], [15, 96], [20, 96], [24, 96],
  [27, 105], [30, 120],
];

const TOTAL_WORKTREES = 15;

for (const [height, width] of COMBOS) {
  test(`row visibility at ${height}x${width}: all page-1 items appear, overflow items do not`, async () => {
    // Set env vars before importing/rendering so the app reads correct dimensions
    process.env.E2E_TTY_ROWS = String(height);
    process.env.E2E_TTY_COLS = String(width);

    const Ink = await import('../../../node_modules/ink/build/index.js');
    const {TestableApp} = await import('../../../dist/App.js');
    const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
    const {FakeGitHubService} = await import('../../../dist-tests/tests/fakes/FakeGitHubService.js');
    const {memoryStore, setupTestProject, setupTestWorktree} = await import('../../../dist-tests/tests/fakes/stores.js');
    const {calculateMainViewPageSize} = await import('../../../dist/shared/utils/layout.js');
    const {CapturingStdout, StdinStub, waitFor, includesWorktree, stripAnsi} = await import('./_utils.js');

    // Reset store and seed 1 project with 15 worktrees. The project path must be
    // writable because the tracker (default startup view) creates tracker/index.json
    // under it before we navigate to the MainView.
    memoryStore.reset();
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'devteam-mv-'));
    setupTestProject('demo', tmpProject);
    for (let i = 1; i <= TOTAL_WORKTREES; i++) {
      setupTestWorktree('demo', `feat-${i.toString().padStart(2, '0')}`);
    }

    const stdout = new CapturingStdout();
    stdout.columns = width;
    stdout.rows = height;
    const stdin = new StdinStub();

    const tree = React.createElement(TestableApp, {
      gitService: new FakeGitService('/fake/projects'),
      gitHubService: new FakeGitHubService(),
    });

    const inst = Ink.render(tree, {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});

    try {
      // Startup routes to the tracker board. The tracker surfaces worktrees without
      // a tracker item as orphans in the Implement column, so once feat-01 appears on
      // the tracker we know WorktreeCore's initial refresh has completed. Then send
      // `t` to toggle over to the MainView; retry the keystroke until the list view
      // renders, since the raw-mode stdin handler attaches asynchronously and a
      // lone keystroke can race with the effect.
      await waitFor(
        () => {
          const f = stripAnsi(stdout.lastFrame() || '');
          return f.includes('Discovery') && f.includes('feat-01');
        },
        {timeout: 3000, interval: 20, message: `tracker + worktrees visible at ${height}x${width}`}
      );

      await waitFor(
        () => {
          stdin.emit('data', Buffer.from('t'));
          return includesWorktree(stdout.lastFrame() || '', 'demo', 'feat-01')
            && !stripAnsi(stdout.lastFrame() || '').includes('Discovery');
        },
        {timeout: 3000, interval: 50, message: `main view visible at ${height}x${width}`}
      );

      const expectedPageSize = calculateMainViewPageSize(height, width);
      const clampedPageSize = Math.min(expectedPageSize, TOTAL_WORKTREES);

      const frame = stdout.lastFrame() || '';
      const clean = stripAnsi(frame);

      // Assert every item on the first page is visible
      for (let i = 1; i <= clampedPageSize; i++) {
        const feature = `feat-${i.toString().padStart(2, '0')}`;
        assert.ok(
          includesWorktree(frame, 'demo', feature),
          `Expected ${feature} [demo] to be visible at ${height}x${width} (pageSize=${expectedPageSize}, item ${i} of ${clampedPageSize}). Frame:\n${clean}`
        );
      }

      // Assert items beyond the page size are NOT visible
      for (let i = clampedPageSize + 1; i <= TOTAL_WORKTREES; i++) {
        const feature = `feat-${i.toString().padStart(2, '0')}`;
        assert.ok(
          !includesWorktree(frame, 'demo', feature),
          `Expected ${feature} [demo] to NOT be visible at ${height}x${width} (pageSize=${expectedPageSize}, item ${i} beyond page). Frame:\n${clean}`
        );
      }
    } finally {
      try { inst.unmount?.(); } catch {}
      try { fs.rmSync(tmpProject, {recursive: true, force: true}); } catch {}
      // Brief delay to allow cleanup before next combo
      await new Promise(r => setTimeout(r, 20));
    }
  });
}
