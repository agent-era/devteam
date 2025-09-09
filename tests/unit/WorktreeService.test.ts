import {describe, beforeEach, test, expect} from '@jest/globals';
import {FakeWorktreeService} from '../fakes/FakeWorktreeService.js';
import {
  resetTestData,
  setupTestProject,
  setupTestWorktree,
  setupFullWorktree,
  expectWorktreeInMemory,
  expectWorktreeNotInMemory,
  expectSessionInMemory,
  expectSessionNotInMemory,
  expectArchivedWorktree,
  memoryStore
} from '../utils/testHelpers.js';
import {setupTestSession} from '../fakes/stores.js';
import {WorktreeInfo, ProjectInfo} from '../../src/models.js';

describe('FakeWorktreeService Operations', () => {
  let worktreeService: FakeWorktreeService;

  beforeEach(() => {
    resetTestData();
    worktreeService = new FakeWorktreeService();
  });

  describe('createFeature', () => {
    test('should create feature worktree with session successfully', async () => {
      // Given: A project exists
      setupTestProject('test-project');
      
      // When: Creating a feature
      const result = await worktreeService.createFeature('test-project', 'new-feature');
      
      // Then: Worktree should be created
      expect(result).toBeTruthy();
      expect(result?.project).toBe('test-project');
      expect(result?.feature).toBe('new-feature');
      expect(result?.branch).toBe('new-feature');
      
      // And: Should exist in memory store
      expectWorktreeInMemory('test-project', 'new-feature');
      
      // And: Should have associated session
      expect(result?.session?.session_name).toBe('dev-test-project-new-feature');
      expectSessionInMemory('dev-test-project-new-feature');
    });

    test('should fail when project does not exist', async () => {
      // Given: No project exists
      
      // When: Attempting to create feature
      const result = await worktreeService.createFeature('nonexistent-project', 'feature');
      
      // Then: Should return null
      expect(result).toBeNull();
      
      // And: No worktree should be created
      expect(memoryStore.worktrees.size).toBe(0);
    });

    test('should handle feature name conflicts', async () => {
      // Given: Project with existing feature
      setupTestProject('test-project');
      setupTestWorktree('test-project', 'existing-feature');
      
      // When: Creating feature with same name
      const result = await worktreeService.createFeature('test-project', 'existing-feature');
      
      // Then: Should fail
      expect(result).toBeNull();
    });

    test('should create multiple features for same project', async () => {
      // Given: A project
      setupTestProject('test-project');
      
      // When: Creating multiple features
      const feature1 = await worktreeService.createFeature('test-project', 'feature-1');
      const feature2 = await worktreeService.createFeature('test-project', 'feature-2');
      
      // Then: Both should be created successfully
      expect(feature1).toBeTruthy();
      expect(feature2).toBeTruthy();
      
      expectWorktreeInMemory('test-project', 'feature-1');
      expectWorktreeInMemory('test-project', 'feature-2');
      
      expectSessionInMemory('dev-test-project-feature-1');
      expectSessionInMemory('dev-test-project-feature-2');
    });
  });

  describe('archiveFeature', () => {
    test('should archive worktree with WorktreeInfo object', async () => {
      // Given: A worktree with session
      setupTestProject('test-project');
      const worktree = setupTestWorktree('test-project', 'test-feature');
      
      // When: Archiving the worktree
      const result = await worktreeService.archiveFeature(worktree);
      
      // Then: Should return archived path
      expect(result.archivedPath).toContain('archived-');
      expect(result.archivedPath).toContain('test-feature');
      
      // And: Worktree should be removed from active list
      expectWorktreeNotInMemory('test-project', 'test-feature');
      
      // And: Should be in archived list
      expectArchivedWorktree('test-project', 'test-feature');
      
      // And: Sessions should be cleaned up
      expectSessionNotInMemory('dev-test-project-test-feature');
    });

    test('should archive worktree with project/feature names', async () => {
      // Given: A worktree
      setupTestProject('test-project');
      const worktree = setupTestWorktree('test-project', 'test-feature');
      
      // When: Archiving using project/feature names
      const result = await worktreeService.archiveFeature('test-project', worktree.path, 'test-feature');
      
      // Then: Should be archived
      expect(result.archivedPath).toBeDefined();
      expectWorktreeNotInMemory('test-project', 'test-feature');
      expectArchivedWorktree('test-project', 'test-feature');
    });

    test('should fail when worktree does not exist', async () => {
      // Given: No worktree exists
      setupTestProject('test-project');
      
      // When: Attempting to archive non-existent worktree
      const promise = worktreeService.archiveFeature('test-project', '/fake/path', 'nonexistent');
      
      // Then: Should throw error
      await expect(promise).rejects.toThrow('Worktree not found');
    });

    test('should clean up all associated sessions', async () => {
      // Given: A worktree with multiple sessions
      setupTestProject('test-project');
      const worktree = setupFullWorktree('test-project', 'test-feature', {
        claudeStatus: 'idle'
      });
      
      // Create additional sessions manually
      worktreeService.tmuxService.createSession('dev-test-project-test-feature-shell', worktree.path);
      worktreeService.tmuxService.createSession('dev-test-project-test-feature-run', worktree.path);
      
      // When: Archiving
      await worktreeService.archiveFeature(worktree);
      
      // Then: All sessions should be cleaned up
      expectSessionNotInMemory('dev-test-project-test-feature');
      expectSessionNotInMemory('dev-test-project-test-feature-shell');
      expectSessionNotInMemory('dev-test-project-test-feature-run');
    });
  });

  describe('createFromBranch', () => {
    test('should create worktree from remote branch', async () => {
      // Given: A project with remote branch
      setupTestProject('test-project');
      
      // When: Creating from remote branch
      const result = await worktreeService.createFromBranch('test-project', 'remote-feature', 'local-feature');
      
      // Then: Should succeed
      expect(result).toBe(true);
      
      // And: Worktree should exist
      expectWorktreeInMemory('test-project', 'local-feature');
      
      // And: Session should be created
      expectSessionInMemory('dev-test-project-local-feature');
    });

    test('should handle creation failure gracefully', async () => {
      // Given: Invalid project
      
      // When: Creating from remote branch
      const result = await worktreeService.createFromBranch('nonexistent', 'branch', 'feature');
      
      // Then: Should fail gracefully
      expect(result).toBe(false);
      expect(memoryStore.worktrees.size).toBe(0);
    });
  });

  describe('deleteArchived', () => {
    test('should delete archived worktree', async () => {
      // Given: An archived worktree
      setupTestProject('test-project');
      const worktree = setupTestWorktree('test-project', 'test-feature');
      const {archivedPath} = await worktreeService.archiveFeature(worktree);
      
      // When: Deleting archived worktree
      const result = await worktreeService.deleteArchived(archivedPath);
      
      // Then: Should succeed
      expect(result).toBe(true);
      
      // And: Should no longer be in archived list
      const archived = memoryStore.archivedWorktrees.get('test-project');
      expect(archived).toBeUndefined();
    });

    test('should fail when archived worktree does not exist', async () => {
      // Given: No archived worktrees
      
      // When: Attempting to delete non-existent archived worktree
      const result = await worktreeService.deleteArchived('/fake/archived/path');
      
      // Then: Should fail
      expect(result).toBe(false);
    });
  });

  describe('session operations', () => {
    test('attachSession should attach to main session', async () => {
      // Given: A worktree with proper session
      setupTestProject('test-project');
      const worktree = setupTestWorktree('test-project', 'test-feature');
      
      // Set up proper session with session_name
      const session = setupTestSession('test-project', 'test-feature', 'idle');
      worktree.session = session;
      memoryStore.worktrees.set(worktree.path, worktree);
      
      // When: Attaching to session
      await worktreeService.attachSession(worktree);
      
      // Then: Should succeed (no error thrown)
      // Note: In real implementation, this would actually attach to tmux session
    });

    test('attachSession should fail when no session exists', async () => {
      // Given: A worktree without session
      const worktree = new WorktreeInfo({
        project: 'test',
        feature: 'test',
        path: '/fake/path',
        branch: 'test'
      });
      
      // When: Attempting to attach
      const promise = worktreeService.attachSession(worktree);
      
      // Then: Should throw error
      await expect(promise).rejects.toThrow('No session found for worktree');
    });

    test('attachShellSession should create and attach to shell session', async () => {
      // Given: A worktree with proper session
      setupTestProject('test-project');
      const worktree = setupTestWorktree('test-project', 'test-feature');
      
      // Set up proper session with session_name
      const session = setupTestSession('test-project', 'test-feature', 'idle');
      worktree.session = session;
      memoryStore.worktrees.set(worktree.path, worktree);
      
      // When: Attaching to shell session
      await worktreeService.attachShellSession(worktree);
      
      // Then: Shell session should be created
      expectSessionInMemory('dev-test-project-test-feature-shell');
    });

    test('attachRunSession should return success when config exists', async () => {
      // Given: A worktree with proper session
      setupTestProject('test-project');
      const worktree = setupTestWorktree('test-project', 'test-feature');
      
      // Set up proper session with session_name
      const session = setupTestSession('test-project', 'test-feature', 'idle');
      worktree.session = session;
      memoryStore.worktrees.set(worktree.path, worktree);
      
      // When: Attaching to run session (will randomly succeed/fail based on mock)
      const result = await worktreeService.attachRunSession(worktree);
      
      // Then: Should return valid status
      expect(['success', 'no_config']).toContain(result);
      
      // If successful, run session should exist
      if (result === 'success') {
        expectSessionInMemory('dev-test-project-test-feature-run');
      }
    });
  });

  describe('project operations', () => {
    test('discoverProjects should return all projects', () => {
      // Given: Multiple projects
      setupTestProject('project-1');
      setupTestProject('project-2');
      setupTestProject('project-3');
      
      // When: Discovering projects
      const projects = worktreeService.discoverProjects();
      
      // Then: Should return all projects
      expect(projects).toHaveLength(3);
      expect(projects.map(p => p.name)).toContain('project-1');
      expect(projects.map(p => p.name)).toContain('project-2');
      expect(projects.map(p => p.name)).toContain('project-3');
    });

    test('getArchivedForProject should return archived worktrees', async () => {
      // Given: A project with archived worktree
      setupTestProject('test-project');
      const project = memoryStore.projects.get('test-project')!;
      const worktree = setupTestWorktree('test-project', 'test-feature');
      await worktreeService.archiveFeature(worktree);
      
      // When: Getting archived worktrees
      const archived = worktreeService.getArchivedForProject(project);
      
      // Then: Should return archived worktree
      expect(archived).toHaveLength(1);
      expect(archived[0].feature).toBe('test-feature');
    });

    test('getRemoteBranches should return remote branches', async () => {
      // Given: A project with remote branches
      memoryStore.remoteBranches.set('test-project', [
        {local_name: 'feature-1', remote_name: 'origin/feature-1', pr_number: 123},
        {local_name: 'feature-2', remote_name: 'origin/feature-2'}
      ]);
      
      // When: Getting remote branches
      const branches = await worktreeService.getRemoteBranches('test-project');
      
      // Then: Should return branches
      expect(branches).toHaveLength(2);
      expect(branches[0].pr_number).toBe(123);
    });
  });

  describe('run configuration', () => {
    test('getRunConfigPath should return correct path', () => {
      // When: Getting run config path
      const path = worktreeService.getRunConfigPath('test-project');
      
      // Then: Should return expected path
      expect(path).toBe('/fake/projects/test-project/run.json');
    });

    test('createOrFillRunConfig should create config successfully', async () => {
      // When: Creating run config
      const result = await worktreeService.createOrFillRunConfig('test-project');
      
      // Then: Should succeed
      expect(result.success).toBe(true);
      expect(result.content).toContain('"commands"');
      expect(result.path).toContain('test-project');
    });
  });

  describe('batch operations', () => {
    test('createMultipleFeatures should create all valid features', async () => {
      // Given: A project
      setupTestProject('test-project');
      
      // When: Creating multiple features
      const result = await worktreeService.createMultipleFeatures('test-project', [
        'feature-1', 'feature-2', 'feature-3'
      ]);
      
      // Then: All should be created
      expect(result.created).toHaveLength(3);
      expect(result.failed).toHaveLength(0);
      
      // And: Should exist in memory
      expectWorktreeInMemory('test-project', 'feature-1');
      expectWorktreeInMemory('test-project', 'feature-2');
      expectWorktreeInMemory('test-project', 'feature-3');
    });

    test('createMultipleFeatures should handle partial failures', async () => {
      // Given: Invalid project for some features
      setupTestProject('valid-project');
      
      const service = new FakeWorktreeService();
      // Mock createFeature to fail for specific features
      const originalCreateFeature = service.createFeature.bind(service);
      service.createFeature = async (project: string, feature: string) => {
        if (feature === 'failing-feature') {
          return null;
        }
        return originalCreateFeature(project, feature);
      };
      
      // When: Creating features with one failure
      const result = await service.createMultipleFeatures('valid-project', [
        'good-feature', 'failing-feature', 'another-good-feature'
      ]);
      
      // Then: Should have partial success
      expect(result.created).toHaveLength(2);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]).toBe('failing-feature');
    });
  });

  describe('utility methods', () => {
    test('getAllWorktrees should return all active worktrees', () => {
      // Given: Multiple worktrees
      setupTestProject('project-1');
      setupTestProject('project-2');
      setupTestWorktree('project-1', 'feature-1');
      setupTestWorktree('project-1', 'feature-2');
      setupTestWorktree('project-2', 'feature-1');
      
      // When: Getting all worktrees
      const worktrees = worktreeService.getAllWorktrees();
      
      // Then: Should return all worktrees
      expect(worktrees).toHaveLength(3);
    });

    test('getWorktreesForProject should filter by project', () => {
      // Given: Multiple projects with worktrees
      setupTestProject('project-1');
      setupTestProject('project-2');
      setupTestWorktree('project-1', 'feature-1');
      setupTestWorktree('project-1', 'feature-2');
      setupTestWorktree('project-2', 'feature-1');
      
      // When: Getting worktrees for specific project
      const worktrees = worktreeService.getWorktreesForProject('project-1');
      
      // Then: Should return only project-1 worktrees
      expect(worktrees).toHaveLength(2);
      expect(worktrees.every(w => w.project === 'project-1')).toBe(true);
    });

    test('isFeatureNameAvailable should check availability correctly', () => {
      // Given: A worktree exists
      setupTestProject('test-project');
      setupTestWorktree('test-project', 'existing-feature');
      
      // When/Then: Checking availability
      expect(worktreeService.isFeatureNameAvailable('test-project', 'existing-feature')).toBe(false);
      expect(worktreeService.isFeatureNameAvailable('test-project', 'new-feature')).toBe(true);
      expect(worktreeService.isFeatureNameAvailable('other-project', 'existing-feature')).toBe(true);
    });

    test('getSessionStatus should return session status', async () => {
      // Given: A worktree with session
      setupTestProject('test-project');
      const worktree = setupTestWorktree('test-project', 'test-feature');
      
      // When: Getting session status
      const status = await worktreeService.getSessionStatus(worktree);
      
      // Then: Should return valid status
      expect(['idle', 'working', 'waiting', 'thinking', 'not_running']).toContain(status);
    });

    test('killAllSessions should clean up all sessions', async () => {
      // Given: A worktree with multiple sessions
      setupTestProject('test-project');
      const worktree = setupFullWorktree('test-project', 'test-feature', {
        claudeStatus: 'idle'
      });
      
      // Create additional sessions
      worktreeService.tmuxService.createSession('dev-test-project-test-feature-shell', worktree.path);
      worktreeService.tmuxService.createSession('dev-test-project-test-feature-run', worktree.path);
      
      // When: Killing all sessions
      await worktreeService.killAllSessions(worktree);
      
      // Then: All sessions should be removed
      expectSessionNotInMemory('dev-test-project-test-feature');
      expectSessionNotInMemory('dev-test-project-test-feature-shell'); 
      expectSessionNotInMemory('dev-test-project-test-feature-run');
    });
  });

  describe('refresh operations', () => {
    test('refresh should update session statuses', async () => {
      // Given: Sessions with initial statuses
      setupTestProject('test-project');
      const worktree = setupFullWorktree('test-project', 'test-feature', {
        claudeStatus: 'idle'
      });
      
      const initialStatus = memoryStore.sessions.get('dev-test-project-test-feature')?.claude_status;
      expect(initialStatus).toBe('idle');
      
      // When: Refreshing
      await worktreeService.refresh();
      
      // Then: Status might have changed (it's random, so just verify it's valid)
      const newStatus = memoryStore.sessions.get('dev-test-project-test-feature')?.claude_status;
      expect(['idle', 'working', 'waiting', 'thinking']).toContain(newStatus);
    });
  });
});
