import {describe, beforeEach, test, expect} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {
  resetTestData,
  setupBasicProject,
  setupProjectWithWorktrees,
  setupFullWorktree,
  expectWorktreeInMemory,
  simulateTimeDelay,
  createTestScenario,
  createActiveWorkSession,
  createFeatureWithPR,
  createMergedFeature,
  expectWorkingSession,
  expectIdleSession,
  expectOpenPR,
  expectMergedPR,
} from '../utils/testHelpers.js';
import {memoryStore} from '../fakes/stores.js';
import {WorktreeInfo, GitStatus, PRStatus, SessionInfo} from '../../src/models.js';

describe('Data Flow E2E', () => {
  beforeEach(() => {
    resetTestData();
  });

  describe('End-to-End Worktree Lifecycle', () => {
    test('should handle complete worktree lifecycle from creation to archival', async () => {
      // Given: A project exists
      setupBasicProject('my-project');
      const {lastFrame} = renderTestApp();
      
      // When: A new feature is created (simulated)
      const scenario = createActiveWorkSession('my-project', 'complete-feature');
      const worktree = scenario.worktrees[0];
      
      await simulateTimeDelay(100);

      // Then: Worktree exists with correct initial state
      const foundWorktree = expectWorktreeInMemory('my-project', 'complete-feature');
      expect(foundWorktree.project).toBe('my-project');
      expect(foundWorktree.feature).toBe('complete-feature');
      expect(foundWorktree.branch).toBe('feature/complete-feature');
      
      // And: Claude session is active
      expectWorkingSession('my-project', 'complete-feature');

      // And: UI displays the worktree with work in progress
      let output = lastFrame();
      expect(output).toContain('my-project/complete-feature');
      expect(output).toContain('+45/-12'); // From createActiveWorkSession factory
      
      // When: Work is completed and PR is created
      const prScenario = createFeatureWithPR('my-project', 'ready-feature', 789);
      
      await simulateTimeDelay(100);

      // Then: PR information is displayed
      expect(expectOpenPR('my-project', 'ready-feature').number).toBe(789);

      // When: PR gets merged and feature is archived (simulated)
      const mergedScenario = createMergedFeature('my-project', 'merged-feature', 789);
      
      // Simulate archiving
      const mergedWorktree = mergedScenario.worktrees[0];
      memoryStore.worktrees.delete(mergedWorktree.path);
      
      // Create properly typed archived worktree
      const archivedWorktree = new WorktreeInfo({
        project: 'my-project',
        feature: 'merged-feature',
        path: mergedWorktree.path,
        branch: mergedWorktree.branch,
        is_archived: true,
        git: new GitStatus(),
        pr: new PRStatus(),
        session: new SessionInfo()
      });
      
      memoryStore.archivedWorktrees.set('my-project', [archivedWorktree]);
      
      await simulateTimeDelay(100);

      // Then: Feature is properly archived
      const archived = memoryStore.archivedWorktrees.get('my-project');
      expect(archived).toBeDefined();
      expect(archived?.length).toBe(1);
      expect(archived?.[0].feature).toBe('merged-feature');
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
    test('should handle interactions between multiple features correctly', async () => {
      // Given: Multiple features with different states
      const baseFeature = createMergedFeature('project', 'base-feature', 100);
      const dependentFeature = createFeatureWithPR('project', 'dependent-feature', 101);
      
      // Update dependent feature to show it's behind
      const dependentGit = memoryStore.gitStatus.get(dependentFeature.worktrees[0].path);
      if (dependentGit) {
        dependentGit.ahead = 3;
        dependentGit.behind = 1;
      }
      
      // Update dependent PR to failing state
      const dependentPR = memoryStore.prStatus.get(dependentFeature.worktrees[0].path);
      if (dependentPR) {
        dependentPR.checks = 'failing';
      }

      const {lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Then: Both features are visible with correct PR numbers
      let output = lastFrame();
      expect(output).toContain('project/base-feature');
      expect(output).toContain('project/dependent-feature');
      expect(output).toContain('100'); // Base PR
      expect(output).toContain('101'); // Dependent PR

      // When: Base feature is archived (simulated since PR is merged)
      const baseWorktree = baseFeature.worktrees[0];
      memoryStore.worktrees.delete(baseWorktree.path);
      
      // Create properly typed archived worktree
      const archivedBaseWorktree = new WorktreeInfo({
        project: 'project',
        feature: 'base-feature',
        path: baseWorktree.path,
        branch: baseWorktree.branch,
        is_archived: true,
        git: new GitStatus(),
        pr: new PRStatus(),
        session: new SessionInfo()
      });
      
      memoryStore.archivedWorktrees.set('project', [archivedBaseWorktree]);

      await simulateTimeDelay(100);

      // Then: Base feature is archived, dependent feature remains
      const archived = memoryStore.archivedWorktrees.get('project');
      expect(archived?.some(w => w.feature === 'base-feature')).toBe(true);

      output = lastFrame();
      expect(output).not.toContain('project/base-feature');
      expect(output).toContain('project/dependent-feature');
      expect(output).toContain('101'); // Dependent PR still there
    });

    test('should handle resource cleanup properly', async () => {
      // Given: Multiple features with different Claude statuses
      const scenario = createTestScenario()
        .withProject('shared-project')
        .withWorktree('shared-project', 'feature-a', {claudeStatus: 'idle'})
        .withWorktree('shared-project', 'feature-b', {claudeStatus: 'working'})
        .withWorktree('shared-project', 'feature-c', {claudeStatus: 'waiting'})
        .build();

      const {lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      const initialSessionCount = memoryStore.sessions.size;
      const initialWorktreeCount = memoryStore.worktrees.size;

      // When: Multiple features are archived (simulated)
      const featureAWorktree = scenario.worktrees[0];
      const featureBWorktree = scenario.worktrees[1];
      
      // Simulate archiving feature-a and feature-b
      memoryStore.worktrees.delete(featureAWorktree.path);
      memoryStore.worktrees.delete(featureBWorktree.path);
      memoryStore.sessions.delete(`dev-shared-project-feature-a`);
      memoryStore.sessions.delete(`dev-shared-project-feature-b`);

      await simulateTimeDelay(100);

      // Then: Proper resource cleanup occurred
      expect(memoryStore.worktrees.size).toBe(initialWorktreeCount - 2);
      expect(memoryStore.sessions.size).toBe(initialSessionCount - 2);

      // And: Remaining feature is still functional
      const output = lastFrame();
      expect(output).toContain('shared-project/feature-c');
      
      // Verify the remaining session still exists with correct status
      const remainingSession = memoryStore.sessions.get('dev-shared-project-feature-c');
      expect(remainingSession).toBeDefined();
      expect(remainingSession?.claude_status).toBe('waiting'); // Should still be waiting
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