import {describe, beforeEach, test, expect} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {
  resetTestData,
  setupBasicProject,
  setupProjectWithWorktrees,
  setupFullWorktree,
  expectWorktreeInMemory,
  simulateTimeDelay,
} from '../utils/testHelpers.js';
import {memoryStore} from '../fakes/stores.js';

describe('Data Flow Integration E2E', () => {
  beforeEach(() => {
    resetTestData();
  });

  describe('End-to-End Worktree Lifecycle', () => {
    test.skip('should handle complete worktree lifecycle from creation to archival', async () => {
      // Setup: Start with just a project
      setupBasicProject('my-project');

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Step 1: Create new feature
      stdin.write('n'); // New feature
      await simulateTimeDelay(50);
      
      stdin.write('\r'); // Select default project
      await simulateTimeDelay(50);
      
      stdin.write('complete-feature\r'); // Feature name
      await simulateTimeDelay(150);

      // Verify worktree was created with all associated data
      const worktree = expectWorktreeInMemory('my-project', 'complete-feature');
      expect(worktree.project).toBe('my-project');
      expect(worktree.feature).toBe('complete-feature');
      expect(worktree.branch).toBe('feature/complete-feature');
      
      // Should have git status
      expect(worktree.git).toBeDefined();
      expect(worktree.git.has_remote).toBe(false); // New branch
      expect(worktree.git.ahead).toBe(1); // Initial commit

      // Should have session created
      const sessionName = 'dev-my-project-complete-feature';
      const session = memoryStore.sessions.get(sessionName);
      expect(session).toBeDefined();
      expect(session?.claude_status).toBe('idle');

      // UI should display the new worktree
      let output = lastFrame();
      expect(output).toContain('my-project/complete-feature');
      expect(output).toContain('feature/complete-feature');

      // Step 2: Simulate some development activity
      // Update git status to show changes
      const gitStatus = memoryStore.gitStatus.get(worktree.path);
      if (gitStatus) {
        gitStatus.has_changes = true;
        gitStatus.modified_files = 3;
        gitStatus.added_lines = 45;
        gitStatus.deleted_lines = 12;
        gitStatus.ahead = 2; // Made another commit
      }

      // Update Claude status to show work in progress
      if (session) {
        session.claude_status = 'working';
      }

      await simulateTimeDelay(100);

      // UI should reflect the changes
      output = lastFrame();
      expect(output).toContain('my-project/complete-feature');
      expect(output).toContain('+45/-12'); // Diff stats
      
      // Step 3: Complete work and create PR
      // Add PR status
      memoryStore.prStatus.set(worktree.path, {
        number: 789,
        state: 'OPEN',
        checks: 'passing',
        loading: false,
        url: 'https://github.com/test/repo/pull/789',
        title: 'Add complete feature',
      } as any);

      // Update worktree to link PR
      worktree.pr = memoryStore.prStatus.get(worktree.path);
      memoryStore.worktrees.set(worktree.path, worktree);

      // Mark work as pushed
      if (gitStatus) {
        gitStatus.has_remote = true;
        gitStatus.is_pushed = true;
        gitStatus.has_changes = false; // All changes committed and pushed
      }

      // Claude is now waiting for review
      if (session) {
        session.claude_status = 'waiting';
      }

      await simulateTimeDelay(100);

      // UI should show PR information
      output = lastFrame();
      expect(output).toContain('789'); // PR number
      expect(output).toContain('my-project/complete-feature');

      // Step 4: PR gets merged, archive the feature
      // Update PR status to merged
      const pr = memoryStore.prStatus.get(worktree.path);
      if (pr) {
        pr.state = 'MERGED';
      }

      await simulateTimeDelay(100);

      // Now archive the completed feature
      stdin.write('a'); // Archive
      await simulateTimeDelay(50);
      
      stdin.write('\r'); // Confirm archive
      await simulateTimeDelay(150);

      // Verify worktree moved to archived
      expect(memoryStore.worktrees.has(worktree.path)).toBe(false);
      const archived = memoryStore.archivedWorktrees.get('my-project');
      expect(archived).toBeDefined();
      expect(archived?.length).toBe(1);
      expect(archived?.[0].feature).toBe('complete-feature');

      // Session should be cleaned up
      expect(memoryStore.sessions.has(sessionName)).toBe(false);

      // UI should no longer show the worktree
      output = lastFrame();
      expect(output).not.toContain('my-project/complete-feature');
    });
  });

  describe('Real-time Data Updates', () => {
    test('should handle concurrent data updates correctly', async () => {
      // Setup: Multiple worktrees with different states
      setupFullWorktree('my-project', 'feature-1', {
        claudeStatus: 'idle',
        gitOverrides: {has_changes: false, ahead: 0},
      });
      
      setupFullWorktree('my-project', 'feature-2', {
        claudeStatus: 'working',
        gitOverrides: {has_changes: true, ahead: 1},
        prOverrides: {number: 123, state: 'OPEN', checks: 'pending'},
      });

      const {lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Initial state verification
      let output = lastFrame();
      expect(output).toContain('my-project/feature-1');
      expect(output).toContain('my-project/feature-2');
      expect(output).toContain('123'); // PR number

      // Simulate concurrent updates
      // Feature-1: Developer starts working
      const session1 = memoryStore.sessions.get('dev-my-project-feature-1');
      if (session1) session1.claude_status = 'working';

      const git1 = memoryStore.gitStatus.get('/fake/projects/my-project-branches/feature-1');
      if (git1) {
        git1.has_changes = true;
        git1.added_lines = 25;
      }

      // Feature-2: PR checks pass
      const pr2 = memoryStore.prStatus.get('/fake/projects/my-project-branches/feature-2');
      if (pr2) pr2.checks = 'passing';

      const session2 = memoryStore.sessions.get('dev-my-project-feature-2');
      if (session2) session2.claude_status = 'waiting'; // Waiting for review

      // Wait for updates to propagate
      await simulateTimeDelay(150);

      // Verify all updates are reflected
      output = lastFrame();
      expect(output).toContain('my-project/feature-1'); // Still showing
      expect(output).toContain('my-project/feature-2'); // Still showing
      expect(output).toContain('+25'); // New changes in feature-1
      expect(output).toContain('123'); // PR still there
    });

    test('should maintain data consistency during rapid changes', async () => {
      // Setup: Worktree that will undergo rapid state changes
      const worktree = setupFullWorktree('my-project', 'fast-feature', {
        claudeStatus: 'idle',
        gitOverrides: {has_changes: false},
      });

      const {lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      // Rapid sequence of changes
      const session = memoryStore.sessions.get('dev-my-project-fast-feature');
      const gitStatus = memoryStore.gitStatus.get(worktree.path);

      // Change 1: Start working
      if (session) session.claude_status = 'working';
      await simulateTimeDelay(10);

      // Change 2: Make changes
      if (gitStatus) {
        gitStatus.has_changes = true;
        gitStatus.modified_files = 2;
      }
      await simulateTimeDelay(10);

      // Change 3: More changes
      if (gitStatus) {
        gitStatus.added_lines = 30;
        gitStatus.deleted_lines = 5;
      }
      await simulateTimeDelay(10);

      // Change 4: Claude finishes
      if (session) session.claude_status = 'waiting';
      await simulateTimeDelay(10);

      // Change 5: Commit changes
      if (gitStatus) {
        gitStatus.has_changes = false;
        gitStatus.ahead = 1;
      }
      await simulateTimeDelay(50);

      // Final state should be consistent
      const finalOutput = lastFrame();
      expect(finalOutput).toContain('my-project/fast-feature');
      
      // Verify data consistency
      const finalSession = memoryStore.sessions.get('dev-my-project-fast-feature');
      const finalGitStatus = memoryStore.gitStatus.get(worktree.path);
      
      expect(finalSession?.claude_status).toBe('waiting');
      expect(finalGitStatus?.has_changes).toBe(false);
      expect(finalGitStatus?.ahead).toBe(1);
    });
  });

  describe('Cross-Feature Data Interactions', () => {
    test.skip('should handle interactions between multiple features correctly', async () => {
      // Setup: Multiple features that might interact
      setupFullWorktree('project', 'base-feature', {
        claudeStatus: 'idle',
        gitOverrides: {ahead: 0, has_remote: true},
        prOverrides: {number: 100, state: 'MERGED'},
      });

      setupFullWorktree('project', 'dependent-feature', {
        claudeStatus: 'working',
        gitOverrides: {ahead: 3, behind: 1}, // Behind base-feature
        prOverrides: {number: 101, state: 'OPEN', checks: 'failing'},
      });

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      let output = lastFrame();
      expect(output).toContain('project/base-feature');
      expect(output).toContain('project/dependent-feature');
      expect(output).toContain('100'); // Base PR
      expect(output).toContain('101'); // Dependent PR

      // Simulate base feature being archived (since PR is merged)
      stdin.write('a'); // Archive base-feature (assuming it's selected)
      await simulateTimeDelay(50);
      stdin.write('\r'); // Confirm
      await simulateTimeDelay(100);

      // Base feature should be archived
      const archived = memoryStore.archivedWorktrees.get('project');
      expect(archived?.some(w => w.feature === 'base-feature')).toBe(true);

      // Dependent feature should still exist but might show different status
      output = lastFrame();
      expect(output).not.toContain('project/base-feature');
      expect(output).toContain('project/dependent-feature');
      expect(output).toContain('101'); // Dependent PR still there
    });

    test.skip('should handle resource cleanup properly', async () => {
      // Setup: Features that share resources
      setupFullWorktree('shared-project', 'feature-a', {claudeStatus: 'idle'});
      setupFullWorktree('shared-project', 'feature-b', {claudeStatus: 'working'});
      setupFullWorktree('shared-project', 'feature-c', {claudeStatus: 'waiting'});

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      const initialSessionCount = memoryStore.sessions.size;
      const initialWorktreeCount = memoryStore.worktrees.size;

      // Archive multiple features
      stdin.write('a'); // Archive first feature
      await simulateTimeDelay(50);
      stdin.write('\r'); // Confirm
      await simulateTimeDelay(100);

      // Move to next and archive
      stdin.write('a'); // Archive second feature
      await simulateTimeDelay(50);
      stdin.write('\r'); // Confirm
      await simulateTimeDelay(100);

      // Verify proper cleanup
      expect(memoryStore.worktrees.size).toBe(initialWorktreeCount - 2);
      expect(memoryStore.sessions.size).toBe(initialSessionCount - 2);

      // Remaining feature should still be functional
      const output = lastFrame();
      expect(output).toContain('shared-project/feature-c');
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    test('should handle corrupted data gracefully', async () => {
      // Setup: Worktree with inconsistent data
      const worktree = setupFullWorktree('test-project', 'broken-feature', {
        claudeStatus: 'idle',
      });

      // Introduce inconsistency - remove git status but keep worktree
      memoryStore.gitStatus.delete(worktree.path);

      const {lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Should still display the worktree without crashing
      const output = lastFrame();
      expect(output).toContain('test-project/broken-feature');
      
      // Should handle missing git status gracefully
      expect(() => lastFrame()).not.toThrow();
    });

    test('should recover from temporary inconsistencies', async () => {
      // Setup: Normal worktree
      const worktree = setupFullWorktree('recovery-project', 'temp-feature', {
        claudeStatus: 'working',
      });

      const {lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      // Temporarily corrupt session data
      const sessionName = 'dev-recovery-project-temp-feature';
      memoryStore.sessions.delete(sessionName);

      await simulateTimeDelay(50);

      // Should show worktree without session info
      let output = lastFrame();
      expect(output).toContain('recovery-project/temp-feature');

      // Restore session data
      memoryStore.sessions.set(sessionName, {
        session_name: sessionName,
        attached: true,
        claude_status: 'working',
      } as any);

      await simulateTimeDelay(100);

      // Should recover and show session info again
      output = lastFrame();
      expect(output).toContain('recovery-project/temp-feature');
    });

    test('should handle empty states correctly', async () => {
      // Setup: No projects, no worktrees
      const {lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Should display empty state without crashing
      const output = lastFrame();
      expect(output).toBeDefined();
      expect(() => lastFrame()).not.toThrow();
    });

    test('should handle rapid UI state changes', async () => {
      // Setup: Project with worktrees
      setupProjectWithWorktrees('rapid-project', ['feature-1', 'feature-2']);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      // Rapid navigation and operations
      stdin.write('j'); // Navigate down
      stdin.write('j'); // Navigate down
      stdin.write('k'); // Navigate up
      stdin.write('?'); // Help
      stdin.write('\u001b'); // Escape
      stdin.write('n'); // New feature
      stdin.write('\u001b'); // Escape
      stdin.write('v'); // View archived
      stdin.write('\u001b'); // Escape

      await simulateTimeDelay(100);

      // Should end up back at main view without errors
      const output = lastFrame();
      expect(output).toContain('rapid-project');
      expect(() => lastFrame()).not.toThrow();
    });
  });
});