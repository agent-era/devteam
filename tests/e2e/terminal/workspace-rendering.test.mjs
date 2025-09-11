import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';

test('MainView renders workspace header with child rows (terminal)', async () => {
  const Ink = await import('../../../node_modules/ink/build/index.js');
  const {TestableApp} = await import('../../../dist/App.js');
  const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
  const {FakeTmuxService} = await import('../../../dist-tests/tests/fakes/FakeTmuxService.js');
  const {FakeGitHubService} = await import('../../../dist-tests/tests/fakes/FakeGitHubService.js');
  const {memoryStore, setupTestProject, setupTestWorktree} = await import('../../../dist-tests/tests/fakes/stores.js');

  // Seed projects and per-project worktrees for the same feature
  memoryStore.reset();
  setupTestProject('projA');
  setupTestProject('projB');
  const wtA = setupTestWorktree('projA', 'feature-x');
  const wtB = setupTestWorktree('projB', 'feature-x');

  // Create a real workspace directory so WorkspaceService detects it
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'devteam-ws-'));
  const wsDir = path.join(tmpBase, 'workspaces', 'feature-x');
  fs.mkdirSync(wsDir, {recursive: true});

  const gitService = new FakeGitService(tmpBase);
  const tmuxService = new FakeTmuxService();
  const gitHubService = new FakeGitHubService();

  // Render App with capturing stdout
  const {CapturingStdout, StdinStub} = await import('./_utils.js');
  const stdout = new CapturingStdout();
  const stdin = new StdinStub();

  const tree = React.createElement(TestableApp, {gitService, gitHubService, tmuxService});
  const inst = Ink.render(tree, {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});

  // Allow time for providers to refresh and render
  await new Promise(r => setTimeout(r, 300));
  const frame = stdout.lastFrame() || '';
  const {stripAnsi} = await import('./_utils.js');
  const clean = stripAnsi(frame);

  // Assertions: header and both children are rendered
  assert.ok(clean.includes('feature-x [workspace]'), 'Expected workspace header row');
  // Children should render tree glyph in branch column and show project only
  const childAFound = clean.includes('├─ [projA]') || clean.includes('└─ [projA]');
  const childBFound = clean.includes('├─ [projB]') || clean.includes('└─ [projB]');
  assert.ok(childAFound, 'Expected child row for projA with tree glyph');
  assert.ok(childBFound, 'Expected child row for projB with tree glyph');

  // Header should appear before children in the rendered output
  const hIdx = clean.indexOf('feature-x [workspace]');
  const aIdx = Math.max(clean.indexOf('├─ [projA]'), clean.indexOf('└─ [projA]'));
  const bIdx = Math.max(clean.indexOf('├─ [projB]'), clean.indexOf('└─ [projB]'));
  assert.ok(hIdx >= 0 && aIdx > hIdx && bIdx > hIdx, 'Header should precede both children');

  try { inst.unmount?.(); } catch {}
  try { fs.rmSync(tmpBase, {recursive: true, force: true}); } catch {}
});
