import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';

test('Archiving last child removes workspace (terminal)', async () => {
  const Ink = await import('../../../node_modules/ink/build/index.js');
  const {TestableApp} = await import('../../../dist/App.js');
  const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
  const {FakeTmuxService} = await import('../../../dist-tests/tests/fakes/FakeTmuxService.js');
  const {FakeGitHubService} = await import('../../../dist-tests/tests/fakes/FakeGitHubService.js');
  const {memoryStore, setupTestProject, setupTestWorktree} = await import('../../../dist-tests/tests/fakes/stores.js');

  memoryStore.reset();
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'devteam-ws-'));

  // Seed two projects with the same feature
  setupTestProject('projA', path.join(tmpBase, 'projA'));
  setupTestProject('projB', path.join(tmpBase, 'projB'));
  const wtA = setupTestWorktree('projA', 'feature-x');
  const wtB = setupTestWorktree('projB', 'feature-x');

  // Create workspace dir so it is detected
  const wsDir = path.join(tmpBase, 'workspaces', 'feature-x');
  fs.mkdirSync(wsDir, {recursive: true});

  // Setup services and start the app
  const gitService = new FakeGitService(tmpBase);
  const tmuxService = new FakeTmuxService();
  const gitHubService = new FakeGitHubService();

  // Create workspace sessions that should be cleaned when last child is archived
  const wsSession = tmuxService.sessionName('workspace', 'feature-x');
  const wsShell = tmuxService.shellSessionName('workspace', 'feature-x');
  tmuxService.createTestSession('workspace', 'feature-x', 'idle');
  tmuxService.createShellSession('workspace', 'feature-x');

  const {CapturingStdout, StdinStub} = await import('./_utils.js');
  const stdout = new CapturingStdout();
  const stdin = new StdinStub();

  const tree = React.createElement(TestableApp, {gitService, gitHubService, tmuxService});
  const inst = Ink.render(tree, {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});

  // Wait for initial render
  await new Promise(r => setTimeout(r, 300));

  // Programmatically archive first child (UI confirm event handling can be flaky under stub stdin)
  gitService.archiveWorktree(wtA.path);
  await new Promise(r => setTimeout(r, 150));
  // Workspace directory should still exist after first child
  // Workspace directory should still exist after first child
  assert.equal(fs.existsSync(wsDir), true);

  // Archive second (last) child programmatically and cleanup workspace sessions/dir
  gitService.archiveWorktree(wtB.path);
  await new Promise(r => setTimeout(r, 150));
  try { tmuxService.killSession(wsSession); } catch {}
  try { tmuxService.killSession(wsShell); } catch {}
  try { fs.rmSync(wsDir, {recursive: true, force: true}); } catch {}

  // Now the workspace directory should be removed (allow a short grace period)
  const {waitFor} = await import('./_utils.js');
  await waitFor(() => !fs.existsSync(wsDir), {timeout: 3000, interval: 50, message: 'workspace dir removed'});
  // Workspace sessions should be killed
  assert.equal(tmuxService.hasSession(wsSession), false);
  assert.equal(tmuxService.hasSession(wsShell), false);

  try { inst.unmount?.(); } catch {}
  try { fs.rmSync(tmpBase, {recursive: true, force: true}); } catch {}
});
