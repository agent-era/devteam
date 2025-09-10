import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

test('renders list rows via MainView', async () => {
  const {render} = await import('../../../node_modules/ink-testing-library/build/index.js');
  const MainView = (await import('../../../dist/components/views/MainView.js')).default;
  const {WorktreeInfo, GitStatus, SessionInfo, PRStatus} = await import('../../../dist/models.js');

  const worktrees = [
    new WorktreeInfo({
      project: 'demo',
      feature: 'feature-1',
      path: '/fake/projects/demo-branches/feature-1',
      branch: 'feature/feature-1',
      git: new GitStatus({base_added_lines: 5, ahead: 1, is_pushed: true}),
      session: new SessionInfo({ai_status: 'idle'}),
      pr: new PRStatus({number: 123, state: 'OPEN', checks: 'passing', loadingStatus: 'exists'})
    }),
    new WorktreeInfo({
      project: 'demo',
      feature: 'feature-2',
      path: '/fake/projects/demo-branches/feature-2',
      branch: 'feature/feature-2',
      git: new GitStatus({base_added_lines: 0, ahead: 0, is_pushed: true}),
      session: new SessionInfo({ai_status: 'not_running'}),
      pr: new PRStatus({loadingStatus: 'no_pr'})
    })
  ];

  const {lastFrame, unmount} = render(
    React.createElement(MainView, {worktrees, selectedIndex: 0, page: 0, pageSize: 20})
  );

  const {waitFor, includesWorktree} = await import('./_utils.js');
  await waitFor(() => {
    const frame = lastFrame?.() || '';
    return includesWorktree(frame, 'demo', 'feature-1') && includesWorktree(frame, 'demo', 'feature-2');
  }, {timeout: 3000, interval: 50, message: 'rows render'});
  try { unmount?.(); } catch {}
});
