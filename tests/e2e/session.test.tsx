import {describe, beforeEach, test, expect} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {
  resetTestData,
  setupProjectWithWorktrees,
  setupWorktreeWithSession,
  expectSessionInMemory,
  expectSessionNotInMemory,
  simulateTimeDelay,
  setupBasicProject,
  setupRemoteBranches,
  memoryStore,
} from '../utils/testHelpers.js';

describe('Session Management E2E', () => {
  beforeEach(() => {
    resetTestData();
  });

  describe('Session Creation', () => {
    test('should create tmux session when attaching to worktree', async () => {
      // Setup: Worktree with no active session
      const {worktrees} = setupProjectWithWorktrees('my-project', ['feature-1']);

      const {services, lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Verify worktree is displayed
      expect(lastFrame()).toContain('my-project/feature-1');

      // Create session through service
      const sessionName = services.tmuxService.createSession('my-project', 'feature-1', 'idle');
      await simulateTimeDelay(150);

      // Verify session was created in memory
      const session = expectSessionInMemory(sessionName);
      expect(session.session_name).toBe(sessionName);
      expect(session.attached).toBe(true);
      expect(session.claude_status).toBe('idle'); // Should start Claude
    });

    test('should create shell session', async () => {
      // Setup: Worktree
      const {worktrees} = setupProjectWithWorktrees('my-project', ['feature-1']);

      const {services, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      // Create shell session through service
      const shellSessionName = services.tmuxService.createShellSession('my-project', 'feature-1');
      await simulateTimeDelay(100);

      // Verify shell session was created
      const session = expectSessionInMemory(shellSessionName);
      expect(session.session_name).toBe(shellSessionName);
      expect(session.attached).toBe(true);
      expect(session.claude_status).toBe('active'); // Shell sessions are active
    });

    test('should reuse existing session when attaching', async () => {
      // Setup: Worktree with existing session
      const {worktree, session} = setupWorktreeWithSession('my-project', 'feature-1', 'idle');

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      const sessionsCountBefore = memoryStore.sessions.size;

      // Press Enter to attach to existing session
      stdin.write('\r');
      await simulateTimeDelay(100);

      // Should not create a new session
      expect(memoryStore.sessions.size).toBe(sessionsCountBefore);
      
      // Should still have the same session
      const existingSession = expectSessionInMemory(session.session_name);
      expect(existingSession.claude_status).toBe('idle');
    });
  });

  describe('Claude Status Tracking', () => {
    test('should display Claude status correctly in UI', async () => {
      // Setup: Worktree with working Claude session
      const {worktree, session} = setupWorktreeWithSession('my-project', 'feature-1', 'working');

      const {lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Should show working status in AI column
      const output = lastFrame();
      expect(output).toContain('my-project/feature-1');
      // The exact symbol depends on constants, but should indicate working status
    });

    test('should update Claude status over time', async () => {
      // Setup: Worktree with idle Claude session
      const {worktree, session} = setupWorktreeWithSession('my-project', 'feature-1', 'idle');

      const {lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      let output = lastFrame();
      expect(output).toContain('my-project/feature-1');

      // Simulate Claude becoming active
      const sessionInfo = memoryStore.sessions.get(session.session_name);
      if (sessionInfo) {
        sessionInfo.claude_status = 'working';
      }

      // Wait for refresh cycle (AI status refreshes every 2 seconds)
      await simulateTimeDelay(2100);

      // Should show updated status
      output = lastFrame();
      expect(output).toContain('my-project/feature-1');
      // Should show working status now
    });

    test('should handle different Claude statuses', async () => {
      // Test each Claude status
      const statuses = ['not_running', 'idle', 'working', 'waiting', 'active'];
      
      for (const status of statuses) {
        resetTestData();
        const {worktree, session} = setupWorktreeWithSession('my-project', 'feature-1', status);

        const {lastFrame} = renderTestApp();
        await simulateTimeDelay(50);

        const output = lastFrame();
        expect(output).toContain('my-project/feature-1');
        // Each status should be represented differently in the UI
      }
    });
  });

  describe('Session Cleanup', () => {
    test('should cleanup orphaned sessions when worktree is deleted', async () => {
      // Setup: Worktree with session
      const {worktree, session} = setupWorktreeWithSession('my-project', 'feature-1', 'idle');

      const {services} = renderTestApp();
      await simulateTimeDelay(50);

      // Archive the worktree by removing it from memory
      memoryStore.worktrees.delete(worktree.path);
      const archived = memoryStore.archivedWorktrees.get('my-project') || [];
      archived.push(worktree);
      memoryStore.archivedWorktrees.set('my-project', archived);

      // Trigger cleanup of orphaned sessions
      services.tmuxService.cleanupOrphanedSessions([]);

      // Session should be cleaned up when worktree is archived
      expectSessionNotInMemory(session.session_name);
    });

    test('should preserve shell sessions during cleanup', async () => {
      // Setup: Worktree with both regular and shell sessions
      const {worktree, session} = setupWorktreeWithSession('my-project', 'feature-1', 'idle');
      
      // Add shell session through service
      const {services} = renderTestApp();
      const shellSessionName = services.tmuxService.createShellSession('my-project', 'feature-1');
      await simulateTimeDelay(50);

      // Archive the worktree by removing it from memory
      memoryStore.worktrees.delete(worktree.path);
      const archived = memoryStore.archivedWorktrees.get('my-project') || [];
      archived.push(worktree);
      memoryStore.archivedWorktrees.set('my-project', archived);

      // Trigger cleanup with no valid worktrees
      services.tmuxService.cleanupOrphanedSessions([]);

      // Regular session should be cleaned up
      expectSessionNotInMemory(session.session_name);
      
      // Shell session should be preserved
      expectSessionInMemory(shellSessionName);
    });
  });

  describe('Session Integration with Features', () => {
    test('should update session info when creating new feature', async () => {
      // Setup: Project for creating new feature
      setupBasicProject('my-project');

      const {services, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      // Create new feature through service
      services.worktreeService.createFeature('my-project', 'new-feature');
      await simulateTimeDelay(50);
      
      // Create a session for the new feature
      const sessionName = services.tmuxService.createSession('my-project', 'new-feature', 'idle');
      await simulateTimeDelay(150);

      // Should have created a session for the new feature
      const session = expectSessionInMemory(sessionName);
      expect(session.claude_status).toBe('idle');
    });

    test('should create session when creating worktree from remote branch', async () => {
      // Setup: Project with remote branches
      setupBasicProject('my-project');
      setupRemoteBranches('my-project', [
        {local_name: 'feature-x', remote_name: 'origin/feature-x'}
      ]);

      const {services, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      // Create from remote branch through service
      services.gitService.createWorktreeFromRemote('my-project', 'origin/feature-x', 'feature-x');
      await simulateTimeDelay(50);
      
      // Create session for the new worktree
      const sessionName = services.tmuxService.createSession('my-project', 'feature-x', 'idle');
      await simulateTimeDelay(150);

      // Should have created session for the new worktree
      expectSessionInMemory(sessionName);
    });
  });

  describe('Session State Persistence', () => {
    test('should maintain session state across UI refreshes', async () => {
      // Setup: Worktree with session
      const {worktree, session} = setupWorktreeWithSession('my-project', 'feature-1', 'working');

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      // Manual refresh
      stdin.write('r');
      await simulateTimeDelay(100);

      // Session should still exist with same state
      const persistedSession = expectSessionInMemory(session.session_name);
      expect(persistedSession.claude_status).toBe('working');
      expect(persistedSession.attached).toBe(true);

      // UI should still show the session info
      const output = lastFrame();
      expect(output).toContain('my-project/feature-1');
    });

    test('should handle session status changes during app lifecycle', async () => {
      // Setup: Session that changes status
      const {worktree, session} = setupWorktreeWithSession('my-project', 'feature-1', 'idle');

      const {lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      // Simulate Claude starting to work
      const sessionInfo = memoryStore.sessions.get(session.session_name);
      if (sessionInfo) {
        sessionInfo.claude_status = 'working';
      }
      
      await simulateTimeDelay(100);

      // Then finishing work
      if (sessionInfo) {
        sessionInfo.claude_status = 'waiting';
      }
      
      await simulateTimeDelay(100);

      // UI should reflect the final state
      const output = lastFrame();
      expect(output).toContain('my-project/feature-1');
      // Should show waiting status
    });
  });

  describe('Multiple Session Management', () => {
    test('should handle multiple concurrent sessions', async () => {
      // Setup: Multiple worktrees with sessions
      setupProjectWithWorktrees('my-project', ['feature-1', 'feature-2', 'feature-3']);
      
      // Create sessions for each
      setupWorktreeWithSession('my-project', 'feature-1', 'idle');
      setupWorktreeWithSession('my-project', 'feature-2', 'working');
      setupWorktreeWithSession('my-project', 'feature-3', 'waiting');

      const {lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Should display all worktrees with their session statuses
      const output = lastFrame();
      expect(output).toContain('my-project/feature-1');
      expect(output).toContain('my-project/feature-2');
      expect(output).toContain('my-project/feature-3');

      // Each should show different status indicators
      // (Exact symbols depend on constants)
    });

    test('should track session changes across multiple worktrees', async () => {
      // Setup: Multiple sessions
      setupProjectWithWorktrees('my-project', ['feature-1', 'feature-2']);
      setupWorktreeWithSession('my-project', 'feature-1', 'idle');
      setupWorktreeWithSession('my-project', 'feature-2', 'idle');

      const {lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      // Change status of first session
      const session1 = memoryStore.sessions.get('dev-my-project-feature-1');
      if (session1) session1.claude_status = 'working';

      await simulateTimeDelay(100);

      // Change status of second session
      const session2 = memoryStore.sessions.get('dev-my-project-feature-2');
      if (session2) session2.claude_status = 'waiting';

      await simulateTimeDelay(100);

      // Both changes should be reflected in UI
      const output = lastFrame();
      expect(output).toContain('my-project/feature-1');
      expect(output).toContain('my-project/feature-2');
    });
  });
});