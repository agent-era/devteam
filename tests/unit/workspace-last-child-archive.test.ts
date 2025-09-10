import {describe, beforeEach, test, expect} from '@jest/globals';
import React from 'react';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {render} from 'ink-testing-library';
import {WorktreeProvider, useWorktreeContext} from '../../src/contexts/WorktreeContext.js';
import {GitHubProvider} from '../../src/contexts/GitHubContext.js';
import {UIProvider} from '../../src/contexts/UIContext.js';
import {FakeGitService} from '../fakes/FakeGitService.js';
import {FakeTmuxService} from '../fakes/FakeTmuxService.js';
import {FakeGitHubService} from '../fakes/FakeGitHubService.js';
import {WorkspaceService} from '../../src/services/WorkspaceService.js';
import {memoryStore, setupTestProject, setupTestWorktree} from '../fakes/stores.js';

const h = React.createElement;

function WithWorktreeContext({onReady}: {onReady: (ctx: ReturnType<typeof useWorktreeContext>) => Promise<void> | void}) {
  const ctx = useWorktreeContext();
  React.useEffect(() => { onReady(ctx); }, [ctx, onReady]);
  return h('div');
}

// Lightweight wrappers to avoid strict prop typing issues in tests
function TestWorktreeProvider(props: any) {
  const {children, gitService, tmuxService, workspaceService} = props;
  return h(WorktreeProvider as any, {gitService, tmuxService, workspaceService, children} as any);
}

function TestGitHubProvider(props: any) {
  const {children, gitHubService} = props;
  return h(GitHubProvider as any, {gitHubService, children} as any);
}

describe('Workspace archive behavior: last child cleanup', () => {
  beforeEach(() => {
    memoryStore.reset();
  });

  test('archiving the final child removes the workspace directory and kills workspace sessions', async () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'devteam-ws-test-'));
    const gitService = new FakeGitService(tmpBase);
    const tmuxService = new FakeTmuxService();
    const gitHubService = new FakeGitHubService();
    const workspaceService = new WorkspaceService();

    // Seed projects and worktrees for the same feature
    setupTestProject('projA', path.join(tmpBase, 'projA'));
    setupTestProject('projB', path.join(tmpBase, 'projB'));
    const wtA = setupTestWorktree('projA', 'feature-x');
    const wtB = setupTestWorktree('projB', 'feature-x');

    const wsDir = path.join(tmpBase, 'workspaces', 'feature-x');

    // Prepare a promise the test can await on
    await new Promise<void>((resolve, reject) => {
      const onReady = async (ctx: any) => {
        try {
          // Create workspace and refresh to populate grouping
          await ctx.createWorkspace('feature-x', ['projA', 'projB']);
          await ctx.refresh('none');

          // Create workspace sessions that should be cleaned up
          const wsSession = tmuxService.sessionName('workspace', 'feature-x');
          const wsShell = tmuxService.shellSessionName('workspace', 'feature-x');
          tmuxService.createTestSession('workspace', 'feature-x', 'idle');
          tmuxService.createShellSession('workspace', 'feature-x');
          expect(tmuxService.hasSession(wsSession)).toBe(true);
          expect(tmuxService.hasSession(wsShell)).toBe(true);

          // Sanity check: workspace dir exists
          expect(fs.existsSync(wsDir)).toBe(true);

          // Archive first child: workspace should remain
          await ctx.archiveFeature('projA', wtA.path, 'feature-x');
          expect(fs.existsSync(wsDir)).toBe(true);

          // Archive second (last) child: workspace should be removed
          await ctx.archiveFeature('projB', wtB.path, 'feature-x');
          expect(fs.existsSync(wsDir)).toBe(false);

          // Workspace sessions should be killed
          expect(tmuxService.hasSession(wsSession)).toBe(false);
          expect(tmuxService.hasSession(wsShell)).toBe(false);
        } catch (e) {
          reject(e);
          return;
        } finally {
          try { fs.rmSync(tmpBase, {recursive: true, force: true}); } catch {}
        }
        resolve();
      };

      render(
        h(TestWorktreeProvider, {gitService, tmuxService, workspaceService},
          h(TestGitHubProvider, {gitHubService},
            h(UIProvider, null,
              h(WithWorktreeContext, {onReady})
            )
          )
        )
      );
    });
  }, 15000);
});
