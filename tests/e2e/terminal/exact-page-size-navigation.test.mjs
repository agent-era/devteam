import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

// Ensure app does not auto-exit due to raw-mode checks in tests
process.env.E2E_IGNORE_RAWMODE = '1';

// This test reproduces a bug where having exactly one full page of items
// (equal to measured page size) and pressing down causes the list to go blank.
// The fix ensures navigation does not advance to a non-existent page when
// page size hasn't been established yet or when only a single page exists.
test('does not go blank when items equal page size and pressing down', async () => {
  const Ink = await import('../../../node_modules/ink/build/index.js');
  const {TestableApp} = await import('../../../dist/App.js');
  const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
  const {FakeGitHubService} = await import('../../../dist-tests/tests/fakes/FakeGitHubService.js');
  const {memoryStore, setupTestProject, setupTestWorktree} = await import('../../../dist-tests/tests/fakes/stores.js');

  // Use capturing stdout/stdin for Ink with fixed rows/cols
  const {CapturingStdout, StdinStub} = await import('./_utils.js');
  const stdout = new CapturingStdout();
  const stdin = new StdinStub();

  // Seed exactly one full page of items.
  // For CapturingStdout rows=30, the list height (measured page size) is ~25 rows.
  // Seed exactly 25 items to match the measured page size.
  memoryStore.reset();
  setupTestProject('demo');
  const PAGE_SIZE = 25;
  for (let i = 1; i <= PAGE_SIZE; i++) {
    setupTestWorktree('demo', `feature-${i.toString().padStart(2, '0')}`);
  }

  const tree = React.createElement(TestableApp, {
    gitService: new FakeGitService('/fake/projects'),
    gitHubService: new FakeGitHubService(),
  });

  const inst = Ink.render(tree, {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});

  // Allow initial frame to render
  await new Promise(r => setTimeout(r, 250));
  let frame = stdout.lastFrame() || '';

  // Sanity: we should see first and last items on the single page
  assert.ok(frame.includes('demo/feature-01'), 'Expected first item visible');
  assert.ok(frame.includes(`demo/feature-${PAGE_SIZE.toString().padStart(2, '0')}`), 'Expected last item visible');

  // Press down once. With the bug, the parent pageSize=1 causes page to advance to 1,
  // and with measured page size=25, page 1 renders no items (blank list).
  stdin.emit('data', Buffer.from('j'));
  await new Promise(r => setTimeout(r, 200));

  frame = stdout.lastFrame() || '';
  const visibleRows = (frame.match(/demo\/feature-/g) || []).length;

  // The correct behavior: list should not go blank; still show items on the only page.
  assert.ok(visibleRows > 0, 'List should not be blank after pressing down');

  try { inst.unmount?.(); } catch {}
  // Force-close in case any background handles linger in CI
  setTimeout(() => {
    try { process.exit(0); } catch {}
  }, 10);
});
