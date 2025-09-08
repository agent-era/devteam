// Runs the full TestableApp inside a real TTY (tmux pane) with simulated attach
// It seeds one project/worktree using in-memory fakes
import React from 'react';

process.env.E2E_SIMULATE_TMUX_ATTACH = process.env.E2E_SIMULATE_TMUX_ATTACH || '1';

const Ink = await import('../../../node_modules/ink/build/index.js');
const {TestableApp} = await import('../../../dist/App.js');
const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
const {FakeGitHubService} = await import('../../../dist-tests/tests/fakes/FakeGitHubService.js');
const {TmuxService} = await import('../../../dist/services/TmuxService.js');
const {memoryStore, setupTestProject, setupTestWorktree} = await import('../../../dist-tests/tests/fakes/stores.js');

// Seed a single worktree
memoryStore.reset();
setupTestProject('demo');
setupTestWorktree('demo', 'feature-1');

const tree = React.createElement(TestableApp, {
  gitService: new FakeGitService('/fake/projects'),
  gitHubService: new FakeGitHubService(),
  tmuxService: new TmuxService()
});

Ink.render(tree, {exitOnCtrlC: false, patchConsole: false});

