import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

test('App renders EmptyState when projects exist but no worktrees', async () => {
  const Ink = await import('../../../node_modules/ink/build/index.js');
  const {TestableApp} = await import('../../../dist/App.js');
  const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
  const {FakeTmuxService} = await import('../../../dist-tests/tests/fakes/FakeTmuxService.js');
  const {FakeGitHubService} = await import('../../../dist-tests/tests/fakes/FakeGitHubService.js');
  const {memoryStore, setupTestProject} = await import('../../../dist-tests/tests/fakes/stores.js');

  // Seed: projects exist, no worktrees
  memoryStore.reset();
  setupTestProject('demo');

  const gitService = new FakeGitService('/fake/projects');
  const tmuxService = new FakeTmuxService();
  const gitHubService = new FakeGitHubService();

  // Custom stdout/stdin to satisfy Ink raw-mode and capture frames
  const {EventEmitter} = await import('node:events');
  class CapturingStdout extends EventEmitter {
    constructor(){ super(); this.frames=[]; this._last=''; this.isTTY=true; this.columns=100; this.rows=30; }
    write(chunk){ const s = typeof chunk === 'string'? chunk: String(chunk); this.frames.push(s); this._last=s; return true; }
    lastFrame(){ return this._last; }
    on(){ return super.on(...arguments); }
    off(){ return super.off(...arguments); }
  }
  class StdinStub extends EventEmitter {
    constructor(){ super(); this.isTTY=true; }
    setEncoding(){}
    setRawMode(){}
    ref(){}
    unref(){}
    read(){ return null; }
  }
  const stdout = new CapturingStdout();
  const stdin = new StdinStub();

  const tree = React.createElement(TestableApp, {gitService, gitHubService, tmuxService});
  const inst = Ink.render(tree, {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});
  await new Promise(r => setTimeout(r, 350));
  const frame = stdout.lastFrame() || '';
  assert.ok(frame.includes('Welcome to DevTeam'), 'Expected EmptyState welcome text');
  assert.ok(frame.includes('Press [n] to create a new branch'), 'Expected create-branch hint');
  assert.ok(frame.includes('Press [q] to quit'), 'Expected quit hint');
  try { inst.unmount?.(); } catch {}
});

