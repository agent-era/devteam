import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';

test('CHANGES column shows ahead/behind for workspace children (base branch)', async () => {
  process.env.NO_APP_INTERVALS = '1';
  const Ink = await import('../../../node_modules/ink/build/index.js');
  const {TestableApp} = await import('../../../dist/App.js');
  const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
  const {FakeTmuxService} = await import('../../../dist-tests/tests/fakes/FakeTmuxService.js');
  const {FakeGitHubService} = await import('../../../dist-tests/tests/fakes/FakeGitHubService.js');

  // Create a real workspace directory so WorkspaceService detects it
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'devteam-ws-'));
  const wsDir = path.join(tmpBase, 'workspaces', 'feature-y');
  fs.mkdirSync(wsDir, {recursive: true});

  // Seed projects and per-project worktrees for the same feature
  const gitService = new FakeGitService(tmpBase);
  gitService.addProject('projA');
  gitService.addProject('projB');
  const wtA = gitService.addWorktree('projA', 'feature-y');
  const wtB = gitService.addWorktree('projB', 'feature-y');
  // Set ahead/behind for projA child to verify CHANGES column
  gitService.setGitStatus(wtA.path, {ahead: 2, behind: 1, has_remote: true});
  // projB stays clean (default from addWorktree)

  const tmuxService = new FakeTmuxService();
  const gitHubService = new FakeGitHubService();

  const {CapturingStdout, StdinStub, stripAnsi, waitFor} = await import('./_utils.js');
  const stdout = new CapturingStdout();
  const stdin = new StdinStub();

  const tree = React.createElement(TestableApp, {gitService, gitHubService, tmuxService});
  const inst = Ink.render(tree, {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});

  try {
    await waitFor(() => {
      const clean = stripAnsi(stdout.lastFrame() || '');
      return clean.includes('feature-y [workspace]') && (clean.includes('├─ [projA]') || clean.includes('└─ [projA]'));
    }, {timeout: 3000, interval: 50, message: 'workspace header and child visible'});

    const clean = stripAnsi(stdout.lastFrame() || '');
    // Extract the line for projA child and assert CHANGES contains arrows with counts
    const line = (clean.split('\n').find(l => l.includes(' [projA]')) || '').trim();
    assert.ok(line.includes('↑2'), `Expected projA child line to include ahead count: ${line}`);
    assert.ok(line.includes('↓1'), `Expected projA child line to include behind count: ${line}`);
    // Ensure no plain modified-file counts leak into CHANGES (we only show arrows or '-')
    // There should be no standalone numeric token in CHANGES position without arrows.
    // A simple heuristic: arrows should be present if non-clean, and no isolated ' 2 ' without arrows
    assert.ok(!/\s\d+\s/.test(line.replace('↑2', '').replace('↓1', '')), `Unexpected bare number in CHANGES: ${line}`);
  } finally {
    try { inst.unmount?.(); } catch {}
    try { fs.rmSync(tmpBase, {recursive: true, force: true}); } catch {}
  }
});

