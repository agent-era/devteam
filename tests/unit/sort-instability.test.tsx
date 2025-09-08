import {describe, beforeEach, test, expect} from '@jest/globals';
import React, {useEffect, useImperativeHandle, useRef} from 'react';
import {render} from 'ink-testing-library';
import {Box, Text} from 'ink';
import {WorktreeProvider, useWorktreeContext} from '../../src/contexts/WorktreeContext.js';
import {GitHubProvider} from '../../src/contexts/GitHubContext.js';
import {UIProvider} from '../../src/contexts/UIContext.js';
import {FakeGitService} from '../fakes/FakeGitService.js';
import {FakeTmuxService} from '../fakes/FakeTmuxService.js';
import {FakeGitHubService} from '../fakes/FakeGitHubService.js';
import {memoryStore, setupTestProject, setupTestWorktree} from '../utils/testHelpers.js';

/**
 * Repro test for sort instability in main worktree list.
 * Root cause: GitService.getWorktreesForProject() sorts worktrees by directory mtime (descending).
 * When the directory mtime of a worktree changes (e.g., background tools creating/removing files),
 * the next full refresh reorders items. Between full refreshes, visible-row refresh preserves index order.
 */

type ProbeHandle = { refreshNow: () => Promise<void>; refreshVisibleOnly: (page: number, pageSize: number) => Promise<void> };

function OrderProbe(_props: {}, ref: React.Ref<ProbeHandle>) {
  const {worktrees, refresh, refreshVisibleStatus} = useWorktreeContext();
  const initialized = useRef(false);

  useEffect(() => {
    // Prime once to populate list
    if (!initialized.current) {
      initialized.current = true;
      void refresh('none');
    }
  }, [refresh]);

  useImperativeHandle(ref, () => ({
    refreshNow: async () => refresh('none'),
    refreshVisibleOnly: async (page: number, pageSize: number) => refreshVisibleStatus(page, pageSize),
  }));

  return (
    <Box flexDirection="column">
      {worktrees.map((w) => (
        <Text key={`${w.project}/${w.feature}`}>{`${w.project}/${w.feature}`}</Text>
      ))}
    </Box>
  );
}

const ForwardProbe = React.forwardRef(OrderProbe);

describe('Sort instability - worktree list ordering flips with mtime-based sort', () => {
  beforeEach(() => {
    memoryStore.reset();
  });

  test('full refresh reorders by mtime while visible refresh preserves order', async () => {
    // Setup: one project with three features
    setupTestProject('proj');
    const a = setupTestWorktree('proj', 'a');
    const b = setupTestWorktree('proj', 'b');
    const c = setupTestWorktree('proj', 'c');

    // Explicit last commit timestamps to force initial order: c (newest), b, a (oldest)
    const now = Math.floor(Date.now() / 1000);
    memoryStore.worktrees.get(a.path)!.last_commit_ts = now - 3000;
    memoryStore.worktrees.get(b.path)!.last_commit_ts = now - 2000;
    memoryStore.worktrees.get(c.path)!.last_commit_ts = now - 1000;

    const gitService = new FakeGitService();
    const tmuxService = new FakeTmuxService();
    const gitHubService: any = new FakeGitHubService();

    const probeRef = React.createRef<ProbeHandle>();
    const app = render(
      <WorktreeProvider gitService={gitService} tmuxService={tmuxService}>
        <GitHubProvider gitHubService={gitHubService}>
          <UIProvider>
            <ForwardProbe ref={probeRef} />
          </UIProvider>
        </GitHubProvider>
      </WorktreeProvider>
    );

    // Helper to read current order from output
    const readOrder = () =>
      (app.lastFrame() || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

    // Wait a tick for initial refresh
    await new Promise((r) => setTimeout(r, 0));

    // Initial order should be by mtime desc: c, b, a
    let order = readOrder();
    expect(order.slice(0, 3)).toEqual([
      'proj/c',
      'proj/b',
      'proj/a',
    ]);

    // Simulate new commit on 'b' so it becomes newest
    memoryStore.worktrees.get(b.path)!.last_commit_ts = Math.floor(Date.now() / 1000) + 10;

    // Full refresh should reorder: b, c, a
    await probeRef.current!.refreshNow();
    await new Promise((r) => setTimeout(r, 0));
    order = readOrder();
    expect(order.slice(0, 3)).toEqual([
      'proj/b',
      'proj/c',
      'proj/a',
    ]);

    // Now flip so c is newest again
    memoryStore.worktrees.get(c.path)!.last_commit_ts = Math.floor(Date.now() / 1000) + 20;

    // Another full refresh should flip back to c, b, a
    await probeRef.current!.refreshNow();
    await new Promise((r) => setTimeout(r, 0));
    order = readOrder();
    expect(order.slice(0, 3)).toEqual([
      'proj/c',
      'proj/b',
      'proj/a',
    ]);

    // Visible-row refresh path should NOT reorder items (it updates in place by index)
    // Simulate new commit that would normally reorder to put 'a' on top
    memoryStore.worktrees.get(a.path)!.last_commit_ts = Math.floor(Date.now() / 1000) + 30;

    // Call visible-only refresh (does not rebuild/sort list) and verify order remains as-is
    await probeRef.current!.refreshVisibleOnly(0, 10);
    await new Promise((r) => setTimeout(r, 0));

    // Without triggering a full refresh again, the order should remain the same as last full refresh
    order = readOrder();
    expect(order.slice(0, 3)).toEqual([
      'proj/c',
      'proj/b',
      'proj/a',
    ]);

    app.unmount();
  });
});
