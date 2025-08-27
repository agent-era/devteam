import React from 'react';
import {render, RenderOptions} from 'ink-testing-library';
import App from '../../src/App.js';
import {ServicesProvider} from '../../src/contexts/ServicesContext.js';
import {AppStateProvider} from '../../src/contexts/AppStateContext.js';
import {FakeGitService} from '../fakes/FakeGitService.js';
import {FakeTmuxService} from '../fakes/FakeTmuxService.js';
import {FakeWorktreeService} from '../fakes/FakeWorktreeService.js';

const h = React.createElement;

export interface TestAppProps {
  gitService?: FakeGitService;
  tmuxService?: FakeTmuxService;
  worktreeService?: FakeWorktreeService;
}

export function TestApp({gitService, tmuxService, worktreeService}: TestAppProps = {}) {
  const git = gitService || new FakeGitService();
  const tmux = tmuxService || new FakeTmuxService();
  const worktree = worktreeService || new FakeWorktreeService(git, tmux);

  return h(
    ServicesProvider,
    {gitService: git, tmuxService: tmux, worktreeService: worktree},
    h(AppStateProvider, null, h(App))
  );
}

export function renderTestApp(props?: TestAppProps, options?: RenderOptions) {
  return render(h(TestApp, props), options);
}

export * from 'ink-testing-library';