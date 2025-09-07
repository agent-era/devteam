import {describe, beforeEach, test, expect} from '@jest/globals';
import React from 'react';
import {FakeGitService} from '../fakes/FakeGitService.js';
import {FakeTmuxService} from '../fakes/FakeTmuxService.js';
import {FakeGitHubService} from '../fakes/FakeGitHubService.js';
import {useWorktreeContext} from '../../src/contexts/WorktreeContext.js';
import {useGitHubContext} from '../../src/contexts/GitHubContext.js';
import {WorktreeProvider} from '../../src/contexts/WorktreeContext.js';
import {GitHubProvider} from '../../src/contexts/GitHubContext.js';
import {UIProvider} from '../../src/contexts/UIContext.js';
import {PRStatus} from '../../src/models.js';
import {
  resetTestData,
  setupTestProject,
  setupProjectWithWorktrees,
  setupFullWorktree,
  memoryStore,
} from '../utils/testHelpers.js';

const h = React.createElement;

// Test component that uses new contexts
function TestServicesComponent() {
  const {worktrees, createFeature} = useWorktreeContext();
  
  React.useEffect(() => {
    // Create a worktree when component mounts
    createFeature('test-project', 'auto-feature');
  }, [createFeature]);
  
  return h('div', {}, 
    h('p', {}, `Worktrees: ${worktrees.length}`)
  );
}

describe('App Services E2E', () => {
  beforeEach(() => {
    resetTestData();
  });

  describe('Services with Contexts', () => {
    test('should provide contexts for worktree operations', () => {
      setupTestProject('test-project');
      
      const gitService = new FakeGitService();
      const tmuxService = new FakeTmuxService();
      const gitHubService = new FakeGitHubService();
      
      // Create React element with context providers
      const testApp = h(
        WorktreeProvider,
        null,
        h(GitHubProvider, null,
          h(UIProvider, null,
            h(TestServicesComponent)
          )
        )
      );
      
      // Test that context providers can be created
      expect(testApp).toBeDefined();
      
      // Verify service instances are correct types
      expect(gitService).toBeInstanceOf(FakeGitService);
      expect(tmuxService).toBeInstanceOf(FakeTmuxService);
      expect(gitHubService).toBeInstanceOf(FakeGitHubService);
    });

    test('should handle worktree operations through services', () => {
      setupTestProject('context-test');
      
      // Verify initial state
      expect(memoryStore.worktrees.size).toBe(0);
      expect(memoryStore.sessions.size).toBe(0);
      
      // Test services directly (context uses these internally)
      const gitService = new FakeGitService();
      const tmuxService = new FakeTmuxService();
      
      // Create worktree and session
      const worktreeCreated = gitService.createWorktree('context-test', 'context-feature');
      expect(worktreeCreated).toBe(true);
      
      const sessionName = tmuxService.createTestSession('context-test', 'context-feature', 'idle')!;
      expect(sessionName).toBe('dev-context-test-context-feature');
      
      // Verify operations affected memory store
      expect(memoryStore.worktrees.size).toBe(1);
      expect(memoryStore.sessions.size).toBe(1);
      
      const worktree = Array.from(memoryStore.worktrees.values())[0];
      expect(worktree.project).toBe('context-test');
      expect(worktree.feature).toBe('context-feature');
      
      const session = Array.from(memoryStore.sessions.values())[0];
      expect(session.session_name).toBe('dev-context-test-context-feature');
    });

    test('should handle multiple operations maintaining consistency', async () => {
      setupTestProject('multi-test');
      
      const gitService = new FakeGitService();
      const tmuxService = new FakeTmuxService();
      
      // Create multiple features
      gitService.createWorktree('multi-test', 'feature-1');
      gitService.createWorktree('multi-test', 'feature-2');
      gitService.createWorktree('multi-test', 'feature-3');
      
      tmuxService.createTestSession('multi-test', 'feature-1', 'idle')!;
      tmuxService.createTestSession('multi-test', 'feature-2', 'idle')!;
      tmuxService.createTestSession('multi-test', 'feature-3', 'idle')!;
      
      // Verify all created
      expect(memoryStore.worktrees.size).toBe(3);
      expect(memoryStore.sessions.size).toBe(3);
      
      // Get projects and verify they're discoverable
      const projects = gitService.discoverProjects();
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe('multi-test');
      
      const project = projects[0];
      const worktrees = await gitService.getWorktreesForProject(project);
      expect(worktrees.length).toBe(3);
      
      const features = worktrees.map(w => w.feature).sort();
      expect(features).toEqual(['feature-1', 'feature-2', 'feature-3']);
      
      // Archive one feature (simulate archive operation)
      const firstWorktree = worktrees[0];
      const archiveResult = gitService.archiveWorktree(firstWorktree.path);
      expect(typeof archiveResult).toBe('string'); // Returns archived path, not boolean
      
      tmuxService.killSession(`dev-multi-test-${firstWorktree.feature}`);
      
      // Verify state after archive
      expect(memoryStore.worktrees.size).toBe(2);
      expect(memoryStore.sessions.size).toBe(2); // One session killed
      
      const archived = memoryStore.archivedWorktrees.get('multi-test');
      expect(archived?.length).toBe(1);
      expect(archived?.[0].feature).toBe(firstWorktree.feature);
    });

    test('should maintain git status and PR data correctly', async () => {
      const project = setupTestProject('status-test');
      
      // Setup worktree with full status data
      const worktree = setupFullWorktree('status-test', 'status-feature', {
        claudeStatus: 'working',
        gitOverrides: {
          has_changes: true,
          modified_files: 3,
          ahead: 2,
          added_lines: 50,
          deleted_lines: 10,
        },
        prOverrides: {
          number: 456,
          state: 'OPEN',
          checks: 'passing',
          title: 'Test PR for status feature',
        },
      });
      
      const gitService = new FakeGitService();
      const tmuxService = new FakeTmuxService();
      
      // Verify git status is retrievable
      const gitStatus = await gitService.getGitStatus(worktree.path);
      expect(gitStatus.has_changes).toBe(true);
      expect(gitStatus.modified_files).toBe(3);
      expect(gitStatus.ahead).toBe(2);
      expect(gitStatus.added_lines).toBe(50);
      expect(gitStatus.deleted_lines).toBe(10);
      
      // Verify session status
      const sessionName = tmuxService.sessionName('status-test', 'status-feature');
      expect(tmuxService.hasSession(sessionName)).toBe(true);
      const aiStatus = await tmuxService.getAIStatus(sessionName);
      expect(aiStatus.status).toBe('working');
      
      // Verify PR data through GitHub service
      const gitHubService = new FakeGitHubService();
      const prData = gitHubService.batchGetPRStatusForWorktrees([
        {project: 'status-test', path: worktree.path}
      ]);
      
      expect(prData[worktree.path]).toBeDefined();
      expect(prData[worktree.path].number).toBe(456);
      expect(prData[worktree.path].state).toBe('OPEN');
      expect(prData[worktree.path].checks).toBe('passing');
    });

    test('should handle session status updates', async () => {
      setupTestProject('session-test');
      
      const tmuxService = new FakeTmuxService();
      const sessionName = tmuxService.createTestSession('session-test', 'test-feature', 'idle')!;
      
      // Test status transitions
      const aiStatus1 = await tmuxService.getAIStatus(sessionName);
      expect(aiStatus1.status).toBe('idle');
      
      tmuxService.setAIStatus(sessionName, 'working');
      const aiStatus2 = await tmuxService.getAIStatus(sessionName);
      expect(aiStatus2.status).toBe('working');
      
      tmuxService.setAIStatus(sessionName, 'waiting');
      const aiStatus3 = await tmuxService.getAIStatus(sessionName);
      expect(aiStatus3.status).toBe('waiting');
      
      tmuxService.setAIStatus(sessionName, 'idle');
      const aiStatus4 = await tmuxService.getAIStatus(sessionName);
      expect(aiStatus4.status).toBe('idle');
      
      // Verify session capture provides appropriate output
      const output = await tmuxService.capturePane(sessionName);
      expect(output).toContain('Ready to help');
    });

    test('should handle remote branch operations', async () => {
      setupTestProject('remote-test');
      
      const gitService = new FakeGitService();
      
      // Setup remote branches
      memoryStore.remoteBranches.set('remote-test', [
        {local_name: 'feature-from-remote', remote_name: 'origin/feature-from-remote'},
        {local_name: 'another-feature', remote_name: 'origin/another-feature', pr_number: 789},
      ]);
      
      // Get remote branches
      const remoteBranches = await gitService.getRemoteBranches('remote-test');
      expect(remoteBranches.length).toBe(2);
      expect(remoteBranches[0].local_name).toBe('feature-from-remote');
      expect(remoteBranches[1].pr_number).toBe(789);
      
      // Create worktree from remote
      const created = gitService.createWorktreeFromRemote('remote-test', 'origin/feature-from-remote', 'feature-from-remote');
      expect(created).toBe(true);
      
      // Verify worktree was created
      const worktrees = Array.from(memoryStore.worktrees.values());
      const createdWorktree = worktrees.find(w => w.feature === 'feature-from-remote');
      expect(createdWorktree).toBeDefined();
      expect(createdWorktree?.branch).toBe('feature-from-remote');
      
      // Should have proper git status for remote branch
      const gitStatus = memoryStore.gitStatus.get(createdWorktree!.path);
      expect(gitStatus?.has_remote).toBe(true);
      expect(gitStatus?.is_pushed).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle missing projects gracefully', () => {
      const gitService = new FakeGitService();
      
      // Try to create worktree for non-existent project
      const result = gitService.createWorktree('non-existent', 'feature');
      expect(result).toBe(false);
      
      // Should not have created anything in memory
      expect(memoryStore.worktrees.size).toBe(0);
    });

    test('should handle duplicate worktree creation', () => {
      setupTestProject('dup-test');
      const gitService = new FakeGitService();
      
      // Create worktree
      const first = gitService.createWorktree('dup-test', 'duplicate-feature');
      expect(first).toBe(true);
      
      // Try to create same worktree again
      const second = gitService.createWorktree('dup-test', 'duplicate-feature');
      expect(second).toBe(false);
      
      // Should still only have one
      expect(memoryStore.worktrees.size).toBe(1);
    });

    test('should handle session operations on non-existent sessions', async () => {
      const tmuxService = new FakeTmuxService();
      
      expect(tmuxService.hasSession('non-existent')).toBe(false);
      const aiStatus = await tmuxService.getAIStatus('non-existent');
      expect(aiStatus.status).toBe('not_running');
      
      const output = await tmuxService.capturePane('non-existent');
      expect(output).toBe('');
    });

    test('should handle archival of non-existent worktree', () => {
      const gitService = new FakeGitService();
      
      expect(() => {
        gitService.archiveWorktree('/fake/path');
      }).toThrow('Worktree not found');
    });
  });

  describe('PR Status Loading Lifecycle', () => {
    // Test component that captures PR loading states
    function PRLoadingTestComponent() {
      const {worktrees, refresh} = useWorktreeContext();
      const {getPRStatus, refreshPRStatus} = useGitHubContext();
      const [loadingStates, setLoadingStates] = React.useState<string[]>([]);
      
      React.useEffect(() => {
        if (worktrees.length > 0) {
          const worktree = worktrees[0];
          const prStatus = getPRStatus(worktree.path);
          const currentState = prStatus.loadingStatus;
          
          setLoadingStates(prev => {
            if (prev[prev.length - 1] !== currentState) {
              return [...prev, currentState];
            }
            return prev;
          });
        }
      }, [worktrees, getPRStatus]);
      
      // Store states in memory for test access
      React.useEffect(() => {
        (globalThis as any).prLoadingStates = loadingStates;
      }, [loadingStates]);
      
      return h('div', {}, 
        h('p', {}, `Worktrees: ${worktrees.length}`),
        h('p', {}, `Loading states: ${loadingStates.join(' -> ')}`)
      );
    }

    test('should transition PR status from not_checked to loaded states', async () => {
      resetTestData();
      setupTestProject('pr-test');
      
      // Create a worktree
      const gitService = new FakeGitService();
      const created = gitService.createWorktree('pr-test', 'pr-feature');
      expect(created).toBe(true);
      
      const worktreePath = '/home/mserv/projects/pr-test-branches/pr-feature';
      
      // Setup PR data in memory store for this path
      memoryStore.prStatus.set(worktreePath, new PRStatus({
        loadingStatus: 'exists',
        number: 123,
        state: 'OPEN',
        checks: 'passing',
        title: 'Test PR'
      }));
      
      // Initial PR status should be not_checked for new worktrees
      const initialPR = new PRStatus({ loadingStatus: 'not_checked' });
      expect(initialPR.loadingStatus).toBe('not_checked');
      
      // After loading from GitHub service, should have exists status
      const gitHubService = new FakeGitHubService();
      const prData = gitHubService.batchGetPRStatusForWorktrees([{
        project: 'pr-test',
        path: worktreePath
      }]);
      
      expect(prData[worktreePath]).toBeDefined();
      expect(prData[worktreePath].loadingStatus).toBe('exists');
      expect(prData[worktreePath].number).toBe(123);
    });

    test('should cache and restore PR loading status correctly', () => {
      resetTestData();
      setupTestProject('cache-test');
      
      const worktreePath = '/home/mserv/projects/cache-test-branches/cache-feature';
      
      // Create PRStatusCacheService instance
      const cacheService = new (require('../../src/services/PRStatusCacheService.js').PRStatusCacheService)();
      
      // Test different loading statuses are cached correctly
      const testCases = [
        { loadingStatus: 'no_pr' as const, shouldBeCached: true },
        { loadingStatus: 'exists' as const, number: 456, state: 'OPEN' as const, shouldBeCached: true },
        { loadingStatus: 'error' as const, shouldBeCached: true },
        { loadingStatus: 'not_checked' as const, shouldBeCached: false },
        { loadingStatus: 'loading' as const, shouldBeCached: false },
      ];
      
      for (const testCase of testCases) {
        // Clear cache
        cacheService.clear();
        
        // Create PR status
        const prStatus = new PRStatus(testCase);
        
        // Try to cache it
        cacheService.set(worktreePath, prStatus);
        
        // Check if it was cached
        const cached = cacheService.get(worktreePath);
        
        if (testCase.shouldBeCached) {
          expect(cached).not.toBeNull();
          expect(cached?.loadingStatus).toBe(testCase.loadingStatus);
          if (testCase.number) {
            expect(cached?.number).toBe(testCase.number);
          }
        } else {
          expect(cached).toBeNull();
        }
      }
    });

    test('should handle cache persistence of loadingStatus field', () => {
      resetTestData();
      
      const worktreePath = '/home/mserv/projects/persist-test-branches/persist-feature';
      
      // Create two cache service instances to simulate app restart
      const cacheService1 = new (require('../../src/services/PRStatusCacheService.js').PRStatusCacheService)();
      
      // Cache a PR with specific loadingStatus
      const originalPR = new PRStatus({
        loadingStatus: 'exists',
        number: 789,
        state: 'MERGED',
        checks: 'passing',
        title: 'Merged PR'
      });
      
      cacheService1.set(worktreePath, originalPR);
      
      // Create new cache service instance (simulates app restart)
      const cacheService2 = new (require('../../src/services/PRStatusCacheService.js').PRStatusCacheService)();
      
      // Retrieve from cache
      const restoredPR = cacheService2.get(worktreePath);
      
      // Should have preserved loadingStatus
      expect(restoredPR).not.toBeNull();
      expect(restoredPR?.loadingStatus).toBe('exists');
      expect(restoredPR?.number).toBe(789);
      expect(restoredPR?.state).toBe('MERGED');
      expect(restoredPR?.title).toBe('Merged PR');
    });
  });

});

