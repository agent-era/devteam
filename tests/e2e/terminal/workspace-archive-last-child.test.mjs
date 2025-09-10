import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

  const tree = Ink.h(TestableApp, {gitService, gitHubService, tmuxService});
  const inst = Ink.render(tree, {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});

  // Wait for initial render
  await new Promise(r => setTimeout(r, 300));

  // Selection starts at header. Move to first child and archive it.
  stdin.write('j'); // move to child A
  await new Promise(r => setTimeout(r, 50));
  stdin.write('a'); // archive
  await new Promise(r => setTimeout(r, 50));
  stdin.write('y'); // confirm
  await new Promise(r => setTimeout(r, 200));

  // Workspace should still exist after first child
  assert.equal(fs.existsSync(wsDir), true);

  // After refresh, selection should now be on header again; move to remaining child and archive it
  stdin.write('j'); // move to remaining child B
  await new Promise(r => setTimeout(r, 50));
  stdin.write('a');
  await new Promise(r => setTimeout(r, 50));
  stdin.write('y');
  await new Promise(r => setTimeout(r, 300));

  // Now the workspace directory should have been removed
  assert.equal(fs.existsSync(wsDir), false, 'Workspace dir should be removed after last child archived');
  // Workspace sessions should be killed
  assert.equal(tmuxService.hasSession(wsSession), false);
  assert.equal(tmuxService.hasSession(wsShell), false);

  try { inst.unmount?.(); } catch {}
  try { fs.rmSync(tmpBase, {recursive: true, force: true}); } catch {}
});

