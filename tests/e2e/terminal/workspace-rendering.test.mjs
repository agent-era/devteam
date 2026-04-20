import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

// Startup now routes to the tracker board, so we test workspace rendering against
// MainView directly — the same pattern used by mainview-list.test.mjs. We construct
// the workspace header + child worktrees that WorktreeCore would normally build
// from WorkspaceService detection, then render MainView as if that aggregation had
// already run.
test('MainView renders workspace header with child rows (terminal)', async () => {
  const {render} = await import('../../../node_modules/ink-testing-library/build/index.js');
  const MainView = (await import('../../../dist/components/views/MainView.js')).default;
  const {WorktreeInfo, GitStatus, SessionInfo, PRStatus} = await import('../../../dist/models.js');

  const feature = 'feature-x';
  const childA = new WorktreeInfo({
    project: 'projA',
    feature,
    path: `/fake/projects/projA-branches/${feature}`,
    branch: `feature/${feature}`,
    git: new GitStatus(),
    session: new SessionInfo(),
    pr: new PRStatus(),
    is_workspace_child: true,
    parent_feature: feature,
  });
  const childB = new WorktreeInfo({
    project: 'projB',
    feature,
    path: `/fake/projects/projB-branches/${feature}`,
    branch: `feature/${feature}`,
    git: new GitStatus(),
    session: new SessionInfo(),
    pr: new PRStatus(),
    is_workspace_child: true,
    is_last_workspace_child: true,
    parent_feature: feature,
  });
  const header = new WorktreeInfo({
    project: 'workspace',
    feature,
    path: `/fake/workspaces/${feature}`,
    branch: '',
    git: new GitStatus(),
    session: new SessionInfo(),
    pr: new PRStatus(),
    is_workspace: true,
    is_workspace_header: true,
    children: [childA, childB],
  });

  const worktrees = [header, childA, childB];

  const {lastFrame, unmount} = render(
    React.createElement(MainView, {worktrees, selectedIndex: 0, page: 0, pageSize: 20})
  );

  const {waitFor, stripAnsi} = await import('./_utils.js');
  await waitFor(() => {
    const clean = stripAnsi(lastFrame?.() || '');
    return clean.includes(`${feature} [workspace]`);
  }, {timeout: 3000, interval: 50, message: 'workspace header visible'});

  const clean = stripAnsi(lastFrame?.() || '');
  assert.ok(clean.includes(`${feature} [workspace]`), 'Expected workspace header row');
  const childAFound = clean.includes('├─ [projA]') || clean.includes('└─ [projA]');
  const childBFound = clean.includes('├─ [projB]') || clean.includes('└─ [projB]');
  assert.ok(childAFound, 'Expected child row for projA with tree glyph');
  assert.ok(childBFound, 'Expected child row for projB with tree glyph');

  const hIdx = clean.indexOf(`${feature} [workspace]`);
  const aIdx = Math.max(clean.indexOf('├─ [projA]'), clean.indexOf('└─ [projA]'));
  const bIdx = Math.max(clean.indexOf('├─ [projB]'), clean.indexOf('└─ [projB]'));
  assert.ok(hIdx >= 0 && aIdx > hIdx && bIdx > hIdx, 'Header should precede both children');

  try { unmount?.(); } catch {}
});
