import {describe, beforeEach, test, expect} from '@jest/globals';
import {FakeGitService} from '../fakes/FakeGitService.js';
import {FakeTmuxService} from '../fakes/FakeTmuxService.js';
import {FakeWorktreeService} from '../fakes/FakeWorktreeService.js';
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

    test('should get worktrees for project', () => {
      const gitService = new FakeGitService();
      const project = setupTestProject('test-project');
      
      // Create some worktrees
      gitService.createWorktree('test-project', 'feature-1');
      gitService.createWorktree('test-project', 'feature-2');
      
      const worktrees = gitService.getWorktreesForProject(project);
      
      expect(worktrees).toHaveLength(2);
      expect(worktrees.some(w => w.feature === 'feature-1')).toBe(true);
      expect(worktrees.some(w => w.feature === 'feature-2')).toBe(true);
    });
  });

  describe('FakeTmuxService', () => {
    test('should create and manage sessions', () => {
      const tmuxService = new FakeTmuxService();
      
      const sessionName = tmuxService.createSession('test-project', 'test-feature', 'idle');
      
      expect(sessionName).toBe('dev-test-project-test-feature');
      expect(tmuxService.hasSession(sessionName)).toBe(true);
      expect(tmuxService.listSessions()).toContain(sessionName);
    });

    test('should track Claude status', () => {
      const tmuxService = new FakeTmuxService();
      
      const sessionName = tmuxService.createSession('project', 'feature', 'working');
      
      expect(tmuxService.getClaudeStatus(sessionName)).toBe('working');
      
      // Update status
      tmuxService.updateClaudeStatus(sessionName, 'idle');
      expect(tmuxService.getClaudeStatus(sessionName)).toBe('idle');
    });

    test('should kill sessions', () => {
      const tmuxService = new FakeTmuxService();
      
      const sessionName = tmuxService.createSession('project', 'feature');
      expect(tmuxService.hasSession(sessionName)).toBe(true);
      
      tmuxService.killSession(sessionName);
      expect(tmuxService.hasSession(sessionName)).toBe(false);
    });
  });

  describe('FakeWorktreeService', () => {
    test('should create feature with git and session', () => {
      setupTestProject('project');
      const worktreeService = new FakeWorktreeService();
      
      const result = worktreeService.createFeature('project', 'new-feature');
      
      expect(result).not.toBeNull();
      expect(result?.project).toBe('project');
      expect(result?.feature).toBe('new-feature');
      
      // Should have created session
      const sessionName = 'dev-project-new-feature';
      expect(memoryStore.sessions.has(sessionName)).toBe(true);
      
      // Should have created worktree
      const worktrees = Array.from(memoryStore.worktrees.values());
      const worktree = worktrees.find(w => w.feature === 'new-feature');
      expect(worktree).toBeDefined();
    });

    test('should archive feature', () => {
      setupTestProject('project');
      const worktreeService = new FakeWorktreeService();
      
      // Create feature first
      const created = worktreeService.createFeature('project', 'feature-to-archive');
      expect(created).not.toBeNull();
      
      const worktreePath = created!.path;
      
      // Archive it
      const archiveResult = worktreeService.archiveFeature('project', worktreePath, 'feature-to-archive');
      
      expect(archiveResult.archivedPath).toContain('archived');
      
      // Should be moved to archived
      expect(memoryStore.worktrees.has(worktreePath)).toBe(false);
      
      const archived = memoryStore.archivedWorktrees.get('project');
      expect(archived?.some(w => w.feature === 'feature-to-archive')).toBe(true);
      
      // Session should be cleaned up
      expect(memoryStore.sessions.has('dev-project-feature-to-archive')).toBe(false);
    });
  });

  describe('Integration', () => {
    test('should handle complete worktree lifecycle', () => {
      setupTestProject('full-test');
      
      const gitService = new FakeGitService();
      const tmuxService = new FakeTmuxService();
      const worktreeService = new FakeWorktreeService(gitService, tmuxService);
      
      // Create feature
      const created = worktreeService.createFeature('full-test', 'complete-feature');
      expect(created).not.toBeNull();
      
      const worktreePath = created!.path;
      
      // Verify all components exist
      expect(memoryStore.worktrees.has(worktreePath)).toBe(true);
      expect(memoryStore.sessions.has('dev-full-test-complete-feature')).toBe(true);
      
      // Attach to session
      worktreeService.attachOrCreateSession('full-test', 'complete-feature', worktreePath);
      
      const session = memoryStore.sessions.get('dev-full-test-complete-feature');
      expect(session?.claude_status).toBe('idle');
      
      // Archive the feature
      worktreeService.archiveFeature('full-test', worktreePath, 'complete-feature');
      
      // Everything should be cleaned up
      expect(memoryStore.worktrees.has(worktreePath)).toBe(false);
      expect(memoryStore.sessions.has('dev-full-test-complete-feature')).toBe(false);
      
      const archived = memoryStore.archivedWorktrees.get('full-test');
      expect(archived?.length).toBe(1);
      expect(archived?.[0].feature).toBe('complete-feature');
    });
  });
});