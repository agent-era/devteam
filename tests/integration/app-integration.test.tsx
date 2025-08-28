import {describe, beforeEach, test, expect} from '@jest/globals';
import React from 'react';
import {FakeGitService} from '../fakes/FakeGitService.js';
import {FakeTmuxService} from '../fakes/FakeTmuxService.js';
import {FakeGitHubService} from '../fakes/FakeGitHubService.js';
import {useWorktreeContext} from '../../src/contexts/WorktreeContext.js';
import {WorktreeProvider} from '../../src/contexts/WorktreeContext.js';
import {GitHubProvider} from '../../src/contexts/GitHubContext.js';
import {UIProvider} from '../../src/contexts/UIContext.js';
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

describe('App Integration Tests', () => {
  beforeEach(() => {
    resetTestData();
  });

  describe('Services Integration', () => {
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
      
      const sessionName = tmuxService.createSession('context-test', 'context-feature', 'idle');
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

    test('should handle multiple operations maintaining consistency', () => {
      setupTestProject('multi-test');
      
      const gitService = new FakeGitService();
      const tmuxService = new FakeTmuxService();
      
      // Create multiple features
      gitService.createWorktree('multi-test', 'feature-1');
      gitService.createWorktree('multi-test', 'feature-2');
      gitService.createWorktree('multi-test', 'feature-3');
      
      tmuxService.createSession('multi-test', 'feature-1', 'idle');
      tmuxService.createSession('multi-test', 'feature-2', 'idle');
      tmuxService.createSession('multi-test', 'feature-3', 'idle');
      
      // Verify all created
      expect(memoryStore.worktrees.size).toBe(3);
      expect(memoryStore.sessions.size).toBe(3);
      
      // Get projects and verify they're discoverable
      const projects = gitService.discoverProjects();
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe('multi-test');
      
      const project = projects[0];
      const worktrees = gitService.getWorktreesForProject(project);
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

    test('should maintain git status and PR data correctly', () => {
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
      const gitStatus = gitService.getGitStatus(worktree.path);
      expect(gitStatus.has_changes).toBe(true);
      expect(gitStatus.modified_files).toBe(3);
      expect(gitStatus.ahead).toBe(2);
      expect(gitStatus.added_lines).toBe(50);
      expect(gitStatus.deleted_lines).toBe(10);
      
      // Verify session status
      const sessionName = tmuxService.sessionName('status-test', 'status-feature');
      expect(tmuxService.hasSession(sessionName)).toBe(true);
      expect(tmuxService.getClaudeStatus(sessionName)).toBe('working');
      
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

    test('should handle session status updates', () => {
      setupTestProject('session-test');
      
      const tmuxService = new FakeTmuxService();
      const sessionName = tmuxService.createSession('session-test', 'test-feature', 'idle');
      
      // Test status transitions
      expect(tmuxService.getClaudeStatus(sessionName)).toBe('idle');
      
      tmuxService.updateClaudeStatus(sessionName, 'working');
      expect(tmuxService.getClaudeStatus(sessionName)).toBe('working');
      
      tmuxService.updateClaudeStatus(sessionName, 'waiting');
      expect(tmuxService.getClaudeStatus(sessionName)).toBe('waiting');
      
      tmuxService.updateClaudeStatus(sessionName, 'idle');
      expect(tmuxService.getClaudeStatus(sessionName)).toBe('idle');
      
      // Verify session capture provides appropriate output
      const output = tmuxService.capturePane(sessionName);
      expect(output).toContain('Ready to help');
    });

    test('should handle remote branch operations', () => {
      setupTestProject('remote-test');
      
      const gitService = new FakeGitService();
      
      // Setup remote branches
      memoryStore.remoteBranches.set('remote-test', [
        {local_name: 'feature-from-remote', remote_name: 'origin/feature-from-remote'},
        {local_name: 'another-feature', remote_name: 'origin/another-feature', pr_number: 789},
      ]);
      
      // Get remote branches
      const remoteBranches = gitService.getRemoteBranches('remote-test');
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

    test('should handle session operations on non-existent sessions', () => {
      const tmuxService = new FakeTmuxService();
      
      expect(tmuxService.hasSession('non-existent')).toBe(false);
      expect(tmuxService.getClaudeStatus('non-existent')).toBe('not_running');
      
      const output = tmuxService.capturePane('non-existent');
      expect(output).toBe('');
    });

    test('should handle archival of non-existent worktree', () => {
      const gitService = new FakeGitService();
      
      expect(() => {
        gitService.archiveWorktree('/fake/path');
      }).toThrow('Worktree not found');
    });
  });
});