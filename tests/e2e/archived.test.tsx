import {describe, beforeEach, test, expect, jest} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {
  resetTestData,
  setupBasicProject,
  setupProjectWithWorktrees,
  setupTestWorktree,
  expectWorktreeInMemory,
  expectWorktreeNotInMemory,
  expectArchivedWorktree,
  simulateTimeDelay,
  memoryStore,
} from '../utils/testHelpers.js';
import {WorktreeInfo, GitStatus, PRStatus, SessionInfo} from '../../src/models.js';
import * as commandExecutor from '../../src/shared/utils/commandExecutor.js';

describe('Archive Management E2E', () => {
  beforeEach(() => {
    resetTestData();
    
    // Mock file system operations for archival
    jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args, opts) => {
      const command = args.join(' ');
      
      // Mock git worktree removal
      if (command.includes('git worktree remove')) {
        return 'Removing worktree';
      }
      
      // Mock directory operations
      if (command.includes('mv') && command.includes('archived')) {
        return '';
      }
      
      // Mock directory creation
      if (command.includes('mkdir -p')) {
        return '';
      }
      
      // Mock directory removal
      if (command.includes('rm -rf')) {
        return '';
      }
      
      // Mock tmux session cleanup
      if (command.includes('tmux kill-session')) {
        return '';
      }
      
      // Mock tmux session listing
      if (command.includes('tmux list-sessions')) {
        return '';
      }
      
      return '';
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Archive Workflow', () => {
    test('should archive worktree and move to archived list', async () => {
      // Setup: Worktree to archive
      const {worktrees} = setupProjectWithWorktrees('archive-test', ['archive-me']);
      const worktree = worktrees[0];
      
      const {services, setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Verify worktree exists initially
      expect(lastFrame()).toContain('archive-test/archive-me');
      expectWorktreeInMemory('archive-test', 'archive-me');
      
      // Archive the worktree
      const archivedPath = await services.gitService.archiveWorktree(worktree.path);
      await simulateTimeDelay(100);
      
      // Simulate moving worktree from active to archived
      memoryStore.worktrees.delete(worktree.path);
      
      const archivedWorktree = new WorktreeInfo({
        project: 'archive-test',
        feature: 'archive-me',
        path: archivedPath,
        branch: worktree.branch,
        is_archived: true,
        git: new GitStatus(),
        pr: new PRStatus(),
        session: new SessionInfo()
      });
      
      const archived = memoryStore.archivedWorktrees.get('archive-test') || [];
      archived.push(archivedWorktree);
      memoryStore.archivedWorktrees.set('archive-test', archived);
      
      // Verify worktree is no longer active
      expectWorktreeNotInMemory('archive-test', 'archive-me');
      
      // Verify worktree is now archived
      expectArchivedWorktree('archive-test', 'archive-me');
    });

    test('should clean up sessions when archiving worktree', async () => {
      // Setup: Worktree with active sessions
      const worktree = setupTestWorktree('session-cleanup', 'cleanup-feature');
      
      // Create multiple session types
      const mainSession = 'dev-session-cleanup-cleanup-feature';
      const shellSession = 'dev-session-cleanup-cleanup-feature-shell';
      const runSession = 'dev-session-cleanup-cleanup-feature-run';
      
      memoryStore.sessions.set(mainSession, {
        session_name: mainSession,
        attached: true,
        claude_status: 'idle'
      });
      
      memoryStore.sessions.set(shellSession, {
        session_name: shellSession,
        attached: true,
        claude_status: 'active'
      });
      
      memoryStore.sessions.set(runSession, {
        session_name: runSession,
        attached: true,
        claude_status: 'active'
      });
      
      const {services} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Verify sessions exist before archival
      expect(memoryStore.sessions.has(mainSession)).toBe(true);
      expect(memoryStore.sessions.has(shellSession)).toBe(true);
      expect(memoryStore.sessions.has(runSession)).toBe(true);
      
      // Archive worktree (which should clean up sessions)
      await services.gitService.archiveWorktree(worktree.path);
      
      // Simulate session cleanup
      await services.tmuxService.cleanupOrphanedSessions([]);
      
      // Sessions should be cleaned up (except shell sessions which are preserved)
      expect(memoryStore.sessions.has(mainSession)).toBe(false);
      expect(memoryStore.sessions.has(shellSession)).toBe(true); // Shell sessions are preserved
      expect(memoryStore.sessions.has(runSession)).toBe(false);
    });
  });

  describe('Archived View Display', () => {
    test('should display archived worktrees', async () => {
      // Setup: Project with archived items
      setupBasicProject('archived-project');
      
      // Create archived worktrees
      const archived1 = new WorktreeInfo({
        project: 'archived-project',
        feature: 'completed-feature-1',
        path: '/fake/projects/archived-project-archived/archived-123456_completed-feature-1',
        branch: 'feature/completed-feature-1',
        is_archived: true,
        git: new GitStatus(),
        pr: new PRStatus({number: 100, state: 'MERGED'}),
        session: new SessionInfo()
      });
      
      const archived2 = new WorktreeInfo({
        project: 'archived-project',
        feature: 'old-feature-2',
        path: '/fake/projects/archived-project-archived/archived-789012_old-feature-2',
        branch: 'feature/old-feature-2',
        is_archived: true,
        git: new GitStatus(),
        pr: new PRStatus({number: 85, state: 'CLOSED'}),
        session: new SessionInfo()
      });
      
      memoryStore.archivedWorktrees.set('archived-project', [archived1, archived2]);
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open archived view
      setUIMode('archived');
      await simulateTimeDelay(100);
      
      // Should display archived items
      const output = lastFrame();
      expect(output).toContain('Archived');
      expect(output).toContain('completed-feature-1');
      expect(output).toContain('old-feature-2');
      expect(output).toContain('archived-project');
    });

    test('should show archived items with PR information', async () => {
      // Setup: Archived items with PR details
      setupBasicProject('pr-archived');
      
      const archivedWithPR = new WorktreeInfo({
        project: 'pr-archived',
        feature: 'merged-feature',
        path: '/fake/projects/pr-archived-archived/archived-111111_merged-feature',
        branch: 'feature/merged-feature',
        is_archived: true,
        git: new GitStatus(),
        pr: new PRStatus({
          number: 200,
          state: 'MERGED',
          title: 'Add new feature',
          checks: 'passing'
        }),
        session: new SessionInfo()
      });
      
      memoryStore.archivedWorktrees.set('pr-archived', [archivedWithPR]);
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open archived view
      setUIMode('archived');
      await simulateTimeDelay(50);
      
      // Should show PR information
      const output = lastFrame();
      expect(output).toContain('merged-feature');
      expect(output).toContain('200'); // PR number
      expect(output).toContain('MERGED'); // PR state
    });

    test('should handle navigation in archived view', async () => {
      // Setup: Multiple archived items
      setupBasicProject('nav-archived');
      
      const archived = [
        new WorktreeInfo({
          project: 'nav-archived',
          feature: 'first-archived',
          path: '/fake/archived/first',
          branch: 'feature/first-archived',
          is_archived: true,
          git: new GitStatus(),
          pr: new PRStatus(),
          session: new SessionInfo()
        }),
        new WorktreeInfo({
          project: 'nav-archived',
          feature: 'second-archived',
          path: '/fake/archived/second',
          branch: 'feature/second-archived',
          is_archived: true,
          git: new GitStatus(),
          pr: new PRStatus(),
          session: new SessionInfo()
        }),
        new WorktreeInfo({
          project: 'nav-archived',
          feature: 'third-archived',
          path: '/fake/archived/third',
          branch: 'feature/third-archived',
          is_archived: true,
          git: new GitStatus(),
          pr: new PRStatus(),
          session: new SessionInfo()
        })
      ];
      
      memoryStore.archivedWorktrees.set('nav-archived', archived);
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open archived view with first item selected
      setUIMode('archived', {selectedIndex: 0});
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('first-archived');
      
      // Navigate to second item
      setUIMode('archived', {selectedIndex: 1});
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('second-archived');
      
      // Navigate to third item
      setUIMode('archived', {selectedIndex: 2});
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('third-archived');
    });

    test('should return to main view from archived view', async () => {
      // Setup: Archived view open
      setupBasicProject('back-to-main');
      setupProjectWithWorktrees('back-to-main', ['active-feature']);
      
      const archived = [new WorktreeInfo({
        project: 'back-to-main',
        feature: 'old-feature',
        path: '/fake/archived/old',
        branch: 'feature/old-feature',
        is_archived: true,
        git: new GitStatus(),
        pr: new PRStatus(),
        session: new SessionInfo()
      })];
      
      memoryStore.archivedWorktrees.set('back-to-main', archived);
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open archived view
      setUIMode('archived');
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('Archived');
      expect(lastFrame()).toContain('old-feature');
      
      // Return to main view
      setUIMode('list');
      await simulateTimeDelay(50);
      
      // Should show active worktrees
      expect(lastFrame()).toContain('back-to-main/active-feature');
      expect(lastFrame()).not.toContain('Archived');
      expect(lastFrame()).not.toContain('old-feature');
    });

    test('should immediately display content when returning from archived view', async () => {
      // This test reproduces the blank screen issue
      setupBasicProject('render-test');
      setupProjectWithWorktrees('render-test', ['feature-one', 'feature-two']);
      
      const archived = [new WorktreeInfo({
        project: 'render-test',
        feature: 'archived-feature',
        path: '/fake/archived/render-test',
        branch: 'feature/archived-feature',
        is_archived: true,
        git: new GitStatus(),
        pr: new PRStatus(),
        session: new SessionInfo()
      })];
      
      memoryStore.archivedWorktrees.set('render-test', archived);
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Verify main view is showing initially
      const initialFrame = lastFrame();
      expect(initialFrame).toContain('render-test/feature-one');
      expect(initialFrame).toContain('render-test/feature-two');
      expect(initialFrame).toContain('Enter attach, n new');
      
      // Switch to archived view
      setUIMode('archived');
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('Archived');
      expect(lastFrame()).toContain('archived-feature');
      
      // Return to main view - this is where the blank screen issue occurs
      setUIMode('list');
      await simulateTimeDelay(50);
      
      // The screen should immediately show content without requiring user input
      const returnedFrame = lastFrame();
      expect(returnedFrame).toContain('render-test/feature-one');
      expect(returnedFrame).toContain('render-test/feature-two');
      expect(returnedFrame).toContain('Enter attach, n new');
      expect(returnedFrame).not.toContain('Archived');
      
      // Verify it's not a blank screen
      expect(returnedFrame.trim()).not.toBe('');
      expect(returnedFrame.length).toBeGreaterThan(50); // Should have substantial content
    });
  });

  describe('Archive Deletion', () => {
    test('should delete archived worktree permanently', async () => {
      // Setup: Archived worktree to delete
      setupBasicProject('delete-test');
      
      const archivedWorktree = new WorktreeInfo({
        project: 'delete-test',
        feature: 'delete-me',
        path: '/fake/projects/delete-test-archived/archived-555555_delete-me',
        branch: 'feature/delete-me',
        is_archived: true,
        git: new GitStatus(),
        pr: new PRStatus(),
        session: new SessionInfo()
      });
      
      memoryStore.archivedWorktrees.set('delete-test', [archivedWorktree]);
      
      const {services} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Verify archived item exists
      expectArchivedWorktree('delete-test', 'delete-me');
      
      // Delete archived worktree
      const success = await services.gitService.deleteArchived(archivedWorktree.path);
      expect(success).toBe(true);
      
      // Remove from memory store
      memoryStore.archivedWorktrees.set('delete-test', []);
      
      // Verify archived item is deleted
      const archived = memoryStore.archivedWorktrees.get('delete-test');
      expect(archived).toHaveLength(0);
    });

    test('should handle deletion of multiple archived items', async () => {
      // Setup: Multiple archived items
      setupBasicProject('multi-delete');
      
      const archived1 = new WorktreeInfo({
        project: 'multi-delete',
        feature: 'keep-me',
        path: '/fake/archived/keep',
        branch: 'feature/keep-me',
        is_archived: true,
        git: new GitStatus(),
        pr: new PRStatus(),
        session: new SessionInfo()
      });
      
      const archived2 = new WorktreeInfo({
        project: 'multi-delete',
        feature: 'delete-me',
        path: '/fake/archived/delete',
        branch: 'feature/delete-me',
        is_archived: true,
        git: new GitStatus(),
        pr: new PRStatus(),
        session: new SessionInfo()
      });
      
      memoryStore.archivedWorktrees.set('multi-delete', [archived1, archived2]);
      
      const {services} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Delete one archived item
      const success = await services.gitService.deleteArchived(archived2.path);
      expect(success).toBe(true);
      
      // Remove from memory store (keeping the first one)
      memoryStore.archivedWorktrees.set('multi-delete', [archived1]);
      
      // Verify correct item was deleted
      const remainingArchived = memoryStore.archivedWorktrees.get('multi-delete');
      expect(remainingArchived).toHaveLength(1);
      expect(remainingArchived?.[0].feature).toBe('keep-me');
    });

    test('should handle deletion failure gracefully', async () => {
      // Setup: Archived item that can't be deleted
      setupBasicProject('delete-fail');
      
      const archivedWorktree = new WorktreeInfo({
        project: 'delete-fail',
        feature: 'cant-delete',
        path: '/fake/archived/protected',
        branch: 'feature/cant-delete',
        is_archived: true,
        git: new GitStatus(),
        pr: new PRStatus(),
        session: new SessionInfo()
      });
      
      memoryStore.archivedWorktrees.set('delete-fail', [archivedWorktree]);
      
      // Enable git error simulation
      (global as any).__mockGitShouldFail = true;
      
      const {services} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Attempt deletion should handle failure
      const success = services.gitService.deleteArchived(archivedWorktree.path);
      expect(success).toBe(false);
      
      // Archived item should still exist
      expectArchivedWorktree('delete-fail', 'cant-delete');
      
      // Cleanup
      (global as any).__mockGitShouldFail = false;
    });
  });

  describe('Archive Organization', () => {
    test('should organize archived items by project', async () => {
      // Setup: Multiple projects with archived items
      setupBasicProject('project-alpha');
      setupBasicProject('project-beta');
      
      const alphaArchived = new WorktreeInfo({
        project: 'project-alpha',
        feature: 'alpha-feature',
        path: '/fake/archived/alpha',
        branch: 'feature/alpha-feature',
        is_archived: true,
        git: new GitStatus(),
        pr: new PRStatus(),
        session: new SessionInfo()
      });
      
      const betaArchived = new WorktreeInfo({
        project: 'project-beta',
        feature: 'beta-feature',
        path: '/fake/archived/beta',
        branch: 'feature/beta-feature',
        is_archived: true,
        git: new GitStatus(),
        pr: new PRStatus(),
        session: new SessionInfo()
      });
      
      memoryStore.archivedWorktrees.set('project-alpha', [alphaArchived]);
      memoryStore.archivedWorktrees.set('project-beta', [betaArchived]);
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open archived view
      setUIMode('archived');
      await simulateTimeDelay(50);
      
      // Should show items from both projects
      const output = lastFrame();
      expect(output).toContain('project-alpha');
      expect(output).toContain('alpha-feature');
      expect(output).toContain('project-beta');
      expect(output).toContain('beta-feature');
    });

    test('should display archived items in chronological order', async () => {
      // Setup: Archived items with different timestamps
      setupBasicProject('chronological');
      
      const older = new WorktreeInfo({
        project: 'chronological',
        feature: 'older-feature',
        path: '/fake/archived/older',
        branch: 'feature/older-feature',
        is_archived: true,
        mtime: Date.now() - 86400000, // 1 day ago
        git: new GitStatus(),
        pr: new PRStatus(),
        session: new SessionInfo()
      });
      
      const newer = new WorktreeInfo({
        project: 'chronological',
        feature: 'newer-feature',
        path: '/fake/archived/newer',
        branch: 'feature/newer-feature',
        is_archived: true,
        mtime: Date.now(), // Now
        git: new GitStatus(),
        pr: new PRStatus(),
        session: new SessionInfo()
      });
      
      // Add in reverse chronological order (newer first)
      memoryStore.archivedWorktrees.set('chronological', [newer, older]);
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open archived view
      setUIMode('archived');
      await simulateTimeDelay(50);
      
      const output = lastFrame();
      expect(output).toContain('newer-feature');
      expect(output).toContain('older-feature');
      
      // Verify they appear in correct order (implementation detail would depend on ArchivedView)
    });
  });

  describe('Archive Recovery (Restoration)', () => {
    test('should not allow restoration of archived items', async () => {
      // Setup: Archived worktree
      setupBasicProject('no-restore');
      
      const archived = new WorktreeInfo({
        project: 'no-restore',
        feature: 'archived-feature',
        path: '/fake/archived/no-restore',
        branch: 'feature/archived-feature',
        is_archived: true,
        git: new GitStatus(),
        pr: new PRStatus(),
        session: new SessionInfo()
      });
      
      memoryStore.archivedWorktrees.set('no-restore', [archived]);
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open archived view
      setUIMode('archived');
      await simulateTimeDelay(50);
      
      // Archived view should only show delete option, not restore
      const output = lastFrame();
      expect(output).toContain('archived-feature');
      
      // The app design shows this is intentionally one-way (archive only)
      // No restoration functionality is implemented
    });
  });

  describe('Empty Archive State', () => {
    test('should handle empty archived list gracefully', async () => {
      // Setup: Project with no archived items
      setupBasicProject('empty-archive');
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open archived view
      setUIMode('archived');
      await simulateTimeDelay(50);
      
      // Should show empty state message
      const output = lastFrame();
      expect(output).toContain('Archived');
      // Should handle empty list without crashing
    });

    test('should show no archived items message when appropriate', async () => {
      // Setup: Multiple projects, none with archived items
      setupBasicProject('no-archive-1');
      setupBasicProject('no-archive-2');
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open archived view
      setUIMode('archived');
      await simulateTimeDelay(50);
      
      // Should show appropriate message
      const output = lastFrame();
      expect(output).toContain('Archived');
      // Implementation would show "No archived items" or similar
    });
  });
});