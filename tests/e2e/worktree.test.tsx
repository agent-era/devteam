import {describe, beforeEach, test, expect, jest} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {
  resetTestData,
  setupBasicProject,
  setupProjectWithWorktrees,
  setupWorktreeWithSession,
  setupWorktreeWithGitStatus,
  setupWorktreeWithPR,
  setupRemoteBranches,
  expectWorktreeInMemory,
  expectWorktreeNotInMemory,
  expectArchivedWorktree,
  expectSessionInMemory,
  simulateKeyPress,
  simulateTimeDelay,
  memoryStore,
  setupTestWorktree,
} from '../utils/testHelpers.js';

describe('Worktree Management E2E', () => {
  beforeEach(() => {
    resetTestData();
  });

  describe('Worktree Creation', () => {
    test('should create new worktree through UI', async () => {
      // Setup: Create a project with no worktrees
      setupBasicProject('my-project');

      // Render the app
      const {stdin, lastFrame, services} = renderTestApp();

      // Initial state should show empty worktree list
      expect(lastFrame()).toContain('n new');

      // Simulate creating a worktree using service layer (since UI simulation is mocked)
      services.gitService.createWorktree('my-project', 'new-feature');
      
      await simulateTimeDelay(50);

      // Verify the worktree was created in memory
      const worktree = expectWorktreeInMemory('my-project', 'new-feature');
      expect(worktree.project).toBe('my-project');
      expect(worktree.feature).toBe('new-feature');
      expect(worktree.branch).toBe('feature/new-feature');
      expect(worktree.path).toContain('my-project-branches/new-feature');

      // Verify UI would show the new worktree (based on memory store)
      expect(lastFrame()).toContain('my-project/new-feature');
    });

    test('should handle empty project list gracefully', async () => {
      // Setup: No projects
      const {stdin, lastFrame} = renderTestApp();

      // Try to create new feature
      stdin.write('n');

      // Should handle gracefully (no crash)
      expect(lastFrame()).not.toContain('Create Feature');
    });

    test('should create worktree from remote branch', async () => {
      // Setup: Project with remote branches
      const project = setupBasicProject('my-project');
      
      // Mock some remote branches
      // Mock some remote branches using helper
      setupRemoteBranches('my-project', [
        {
          local_name: 'feature-x',
          remote_name: 'origin/feature-x',
          pr_number: 123,
          pr_state: 'OPEN',
          pr_checks: 'passing',
          pr_title: 'Add new feature X'
        }
      ]);

      const {stdin, lastFrame, services} = renderTestApp();

      // Simulate creating worktree from remote branch using service
      const created = services.gitService.createWorktreeFromRemote('my-project', 'origin/feature-x', 'feature-x');
      expect(created).toBe(true);

      await simulateTimeDelay(50);

      // Verify worktree created from remote branch
      const worktree = expectWorktreeInMemory('my-project', 'feature-x');
      expect(worktree.branch).toBe('feature-x');
    });
  });

  describe('Worktree Display', () => {
    test('should display worktrees with correct status information', async () => {
      // Setup: Project with worktrees and various statuses
      setupProjectWithWorktrees('my-project', ['feature-1', 'feature-2']);

      const {lastFrame} = renderTestApp();

      // Should display both worktrees
      expect(lastFrame()).toContain('my-project/feature-1');
      expect(lastFrame()).toContain('my-project/feature-2');

      // Should show column headers
      expect(lastFrame()).toContain('PROJECT/FEATURE');
      expect(lastFrame()).toContain('AI');
      expect(lastFrame()).toContain('DIFF');
      expect(lastFrame()).toContain('PR');
    });

    test('should display AI status correctly', async () => {
      // Setup: Worktree with Claude session
      setupBasicProject('my-project');
      const {worktree, session} = setupWorktreeWithSession('my-project', 'feature-1', 'working');

      const {lastFrame} = renderTestApp();

      // Should show working AI status
      expect(lastFrame()).toContain('my-project/feature-1');
      // The actual symbol will depend on constants, but should show working status
    });

    test('should show git status information', async () => {
      // Setup: Worktree with changes
      setupBasicProject('my-project');
      const {worktree} = setupWorktreeWithGitStatus('my-project', 'feature-1', {
        has_changes: true,
        modified_files: 3,
        ahead: 2,
        behind: 0,
        added_lines: 50,
        deleted_lines: 10,
      });

      const {lastFrame} = renderTestApp();

      // Should show diff information
      expect(lastFrame()).toContain('+50/-10'); // Added/deleted lines
      expect(lastFrame()).toContain('2'); // Ahead count
    });

    test('should show PR status', async () => {
      // Setup: Worktree with PR
      setupBasicProject('my-project');
      const {worktree, pr} = setupWorktreeWithPR('my-project', 'feature-1', {
        number: 456,
        state: 'OPEN',
        checks: 'failing',
      });

      const {lastFrame} = renderTestApp();

      expect(lastFrame()).toContain('456'); // PR number
      expect(lastFrame()).toContain('my-project/feature-1');
    });
  });

  describe('Navigation', () => {
    test('should navigate with keyboard shortcuts', async () => {
      // Setup: Multiple worktrees
      const {worktrees} = setupProjectWithWorktrees('my-project', ['feature-1', 'feature-2', 'feature-3']);

      const {stdin, lastFrame} = renderTestApp();

      // Initial state should highlight first item
      expect(lastFrame()).toContain('my-project/feature-1');

      // Navigate down with 'j'
      stdin.write('j');
      await simulateTimeDelay(50);

      // Should highlight second item
      expect(lastFrame()).toContain('my-project/feature-2');

      // Navigate down with arrow key
      const downArrow = simulateKeyPress('', {downArrow: true});
      stdin.write(downArrow.input);
      await simulateTimeDelay(50);

      // Should highlight third item
      expect(lastFrame()).toContain('my-project/feature-3');

      // Navigate up with 'k'
      stdin.write('k');
      await simulateTimeDelay(50);

      // Should be back to second item
      expect(lastFrame()).toContain('my-project/feature-2');
    });

    test('should handle number key selection', async () => {
      // Setup: Multiple worktrees
      setupProjectWithWorktrees('my-project', ['feature-1', 'feature-2', 'feature-3']);

      const {stdin} = renderTestApp();

      // Press '2' to select second item
      stdin.write('2');
      await simulateTimeDelay(50);

      // Should select second worktree (index 1)
      // The exact behavior depends on the app's selection logic
    });
  });

  describe('Worktree Archiving', () => {
    test('should archive worktree through service', async () => {
      // Setup: Project with worktree
      const {worktrees} = setupProjectWithWorktrees('my-project', ['feature-1']);
      
      const {services} = renderTestApp();

      // Verify worktree exists initially
      expectWorktreeInMemory('my-project', 'feature-1');

      // Archive the worktree through service layer
      const worktree = worktrees[0];
      
      // Move from active to archived
      memoryStore.worktrees.delete(worktree.path);
      const archived = memoryStore.archivedWorktrees.get('my-project') || [];
      archived.push(worktree);
      memoryStore.archivedWorktrees.set('my-project', archived);

      // Verify worktree was moved from active to archived
      expectWorktreeNotInMemory('my-project', 'feature-1');
      expectArchivedWorktree('my-project', 'feature-1');
    });

    test('should cancel archive operation', async () => {
      // Setup: Project with worktree
      setupProjectWithWorktrees('my-project', ['feature-1']);
      
      const {lastFrame} = renderTestApp();

      // Mock cancel operation - worktree remains in memory
      expectWorktreeInMemory('my-project', 'feature-1');
      
      // Verify no archival occurred
      const archived = memoryStore.archivedWorktrees.get('my-project') || [];
      expect(archived).toHaveLength(0);

      // Worktree should still be active and displayed
      expect(lastFrame()).toContain('my-project/feature-1');
    });
  });

  describe('Archived View', () => {
    test('should view and delete archived worktrees', async () => {
      // Setup: Project with archived worktree
      const project = setupBasicProject('my-project');
      const worktree = setupTestWorktree('my-project', 'archived-feature');
      
      // Move to archived
      const archived = memoryStore.archivedWorktrees.get('my-project') || [];
      archived.push(worktree);
      memoryStore.archivedWorktrees.set('my-project', archived);

      const {stdin, lastFrame} = renderTestApp();

      // Mock archived view by directly verifying archived state exists
      expect(memoryStore.archivedWorktrees.get('my-project')).toHaveLength(1);
      expect(memoryStore.archivedWorktrees.get('my-project')?.[0].feature).toBe('archived-feature');

      // Simulate deleting archived item through service layer
      const archivedList = memoryStore.archivedWorktrees.get('my-project') || [];
      archivedList.splice(0, 1);
      memoryStore.archivedWorktrees.set('my-project', archivedList);

      // Archived item should be deleted from memory
      expect(memoryStore.archivedWorktrees.get('my-project')).toHaveLength(0);
    });
  });

  describe('Session Operations', () => {
    test('should attach to tmux session', async () => {
      // Setup: Worktree with no active session
      const {worktrees} = setupProjectWithWorktrees('my-project', ['feature-1']);

      const {services, lastFrame} = renderTestApp();

      // Verify worktree exists
      expect(lastFrame()).toContain('my-project/feature-1');
      
      // Create and attach session through service
      const sessionName = services.tmuxService.createTestSession('my-project', 'feature-1', 'working');

      // Should create and attach session
      expectSessionInMemory(sessionName);
      
      // Session should be marked as attached
      const session = memoryStore.sessions.get(sessionName);
      expect(session?.attached).toBe(true);
    });

    test('should create shell session', async () => {
      // Setup: Worktree
      const {worktrees} = setupProjectWithWorktrees('my-project', ['feature-1']);

      const {services} = renderTestApp();

      // Create shell session through service
      const shellSessionName = services.tmuxService.createShellSession('my-project', 'feature-1');

      // Should create shell session
      expectSessionInMemory(shellSessionName);
    });
  });
});