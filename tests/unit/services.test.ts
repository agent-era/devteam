import {describe, beforeEach, test, expect} from '@jest/globals';
import {FakeGitService} from '../fakes/FakeGitService.js';
import {FakeTmuxService} from '../fakes/FakeTmuxService.js';
import {resetTestData, setupTestProject, memoryStore} from '../utils/testHelpers.js';

describe('Fake Services Unit Tests', () => {
  beforeEach(() => {
    resetTestData();
  });

  describe('FakeGitService', () => {
    test('should discover projects from memory store', () => {
      const gitService = new FakeGitService();
      
      // Setup test data
      setupTestProject('project-1');
      setupTestProject('project-2');
      
      const projects = gitService.discoverProjects();
      
      expect(projects).toHaveLength(2);
      expect(projects[0].name).toBe('project-1');
      expect(projects[1].name).toBe('project-2');
    });

    test('should create worktree in memory', () => {
      const gitService = new FakeGitService();
      setupTestProject('test-project');
      
      const result = gitService.createWorktree('test-project', 'new-feature');
      
      expect(result).toBe(true);
      
      // Verify worktree exists in memory
      const worktrees = Array.from(memoryStore.worktrees.values());
      const created = worktrees.find(w => 
        w.project === 'test-project' && w.feature === 'new-feature'
      );
      
      expect(created).toBeDefined();
      expect(created?.branch).toBe('feature/new-feature');
    });

    test('should get worktrees for project', async () => {
      const gitService = new FakeGitService();
      const project = setupTestProject('test-project');
      
      // Create some worktrees
      gitService.createWorktree('test-project', 'feature-1');
      gitService.createWorktree('test-project', 'feature-2');
      
      const worktrees = await gitService.getWorktreesForProject(project);
      
      expect(worktrees).toHaveLength(2);
      expect(worktrees.some(w => w.feature === 'feature-1')).toBe(true);
      expect(worktrees.some(w => w.feature === 'feature-2')).toBe(true);
    });
  });

  describe('FakeTmuxService', () => {
    test('should create and manage sessions', () => {
      const tmuxService = new FakeTmuxService();
      
      const sessionName = tmuxService.createSession('test-project', 'test-feature', 'idle')!;
      
      expect(sessionName).toBe('dev-test-project-test-feature');
      expect(tmuxService.hasSession(sessionName)).toBe(true);
      expect(tmuxService.listSessions()).toContain(sessionName);
    });

    test('should track Claude status', () => {
      const tmuxService = new FakeTmuxService();
      
      const sessionName = tmuxService.createSession('project', 'feature', 'working')!;
      
      expect(tmuxService.getClaudeStatus(sessionName)).toBe('working');
      
      // Update status
      tmuxService.updateClaudeStatus(sessionName, 'idle');
      expect(tmuxService.getClaudeStatus(sessionName)).toBe('idle');
    });

    test('should kill sessions', () => {
      const tmuxService = new FakeTmuxService();
      
      const sessionName = tmuxService.createSession('project', 'feature')!;
      expect(tmuxService.hasSession(sessionName)).toBe(true);
      
      tmuxService.killSession(sessionName);
      expect(tmuxService.hasSession(sessionName)).toBe(false);
    });
  });

  describe('Integration', () => {
    test('should work together for git and tmux operations', () => {
      setupTestProject('integration-test');
      
      const gitService = new FakeGitService();
      const tmuxService = new FakeTmuxService();
      
      // Create worktree
      const worktreeCreated = gitService.createWorktree('integration-test', 'test-feature');
      expect(worktreeCreated).toBe(true);
      
      // Create session
      const sessionName = tmuxService.createSession('integration-test', 'test-feature', 'idle')!;
      expect(sessionName).toBe('dev-integration-test-test-feature');
      expect(tmuxService.hasSession(sessionName)).toBe(true);
      
      // Verify data in memory store
      const worktrees = Array.from(memoryStore.worktrees.values());
      const worktree = worktrees.find(w => w.feature === 'test-feature');
      expect(worktree).toBeDefined();
      
      const session = memoryStore.sessions.get(sessionName);
      expect(session?.claude_status).toBe('idle');
    });
  });
});