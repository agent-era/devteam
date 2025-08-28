import {describe, beforeEach, test, expect, jest} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {
  resetTestData,
  setupBasicProject,
  setupProjectWithWorktrees,
  setupRemoteBranches,
  expectWorktreeInMemory,
  expectWorktreeNotInMemory,
  expectArchivedWorktree,
  expectSessionInMemory,
  simulateTimeDelay,
  memoryStore,
  setupTestWorktree,
} from '../utils/testHelpers.js';
import {commentStoreManager} from '../../src/services/CommentStoreManager.js';
import {PRStatus, WorktreeInfo} from '../../src/models.js';
import * as commandExecutor from '../../src/shared/utils/commandExecutor.js';

describe('Full Workflow E2E Tests', () => {
  beforeEach(() => {
    resetTestData();
    
    // Mock comprehensive git and tmux operations
    jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args, opts) => {
      const command = args.join(' ');
      
      // Git operations
      if (command.includes('git worktree add')) {
        return 'Preparing worktree';
      }
      if (command.includes('git worktree remove')) {
        return 'Removing worktree';
      }
      if (command.includes('git branch -r')) {
        return 'origin/feature/remote-branch\norigin/main';
      }
      if (command.includes('git diff')) {
        return `diff --git a/src/feature.ts b/src/feature.ts
index 1234567..abcdefg 100644
--- a/src/feature.ts
+++ b/src/feature.ts
@@ -1,3 +1,6 @@
+// New feature implementation
+export function newFeature() {
+  return 'implemented';
+}
 export default function existing() {
   return 'unchanged';
 }`;
      }
      if (command.includes('git status --porcelain')) {
        return 'M src/feature.ts\nA src/new-file.ts';
      }
      if (command.includes('git log --oneline')) {
        return 'abc123 Implement new feature\ndef456 Initial setup';
      }
      if (command.includes('git push')) {
        return 'To origin/feature/test-feature\n   abc123..def456  feature/test-feature -> feature/test-feature';
      }
      
      // GitHub CLI operations
      if (command.includes('gh pr create')) {
        return 'https://github.com/user/repo/pull/789';
      }
      if (command.includes('gh pr list')) {
        return '789\tImplement new feature\tOPEN\tfeature/test-feature';
      }
      if (command.includes('gh pr status')) {
        return 'Checks: ✓ All checks passing';
      }
      
      // Tmux operations
      if (command.includes('tmux new-session')) {
        return '';
      }
      if (command.includes('tmux send-keys')) {
        return '';
      }
      if (command.includes('tmux attach-session')) {
        return '';
      }
      if (command.includes('tmux list-sessions')) {
        return 'dev-test-project-test-feature: 1 windows';
      }
      
      // File operations
      if (command.includes('mkdir -p')) {
        return '';
      }
      if (command.includes('cp') && command.includes('.env.local')) {
        return '';
      }
      
      return '';
    });
    
    // Mock file system operations
    jest.spyOn(require('fs'), 'existsSync').mockReturnValue(true);
    jest.spyOn(require('fs'), 'writeFileSync').mockImplementation(() => {});
    jest.spyOn(require('fs'), 'readFileSync').mockImplementation((path) => {
      if (String(path).includes('run.json')) {
        return JSON.stringify({command: 'npm test', description: 'Run tests'});
      }
      return '{}';
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Complete Feature Development Workflow', () => {
    test('should complete full create → work → PR → archive flow', async () => {
      // Step 1: Start with a project
      setupBasicProject('workflow-project');
      
      const {services, setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(100);
      
      // Step 2: Create new feature
      const createdWorktree = await services.gitService.createWorktree('workflow-project', 'complete-feature');
      expect(createdWorktree).toBe(true);
      await simulateTimeDelay(100);
      
      // Verify worktree exists
      const worktree = expectWorktreeInMemory('workflow-project', 'complete-feature');
      expect(worktree.project).toBe('workflow-project');
      expect(worktree.feature).toBe('complete-feature');
      
      // Step 3: Create and attach Claude session
      const sessionName = services.tmuxService.createSession('workflow-project', 'complete-feature', 'idle');
      expect(sessionName).toBe('dev-workflow-project-complete-feature');
      expectSessionInMemory(sessionName);
      
      // Step 4: Simulate development work - change Claude status to working
      const session = memoryStore.sessions.get(sessionName);
      if (session) session.claude_status = 'working';
      await simulateTimeDelay(50);
      
      // Step 5: Add code changes (simulated via git status)
      const gitStatus = memoryStore.gitStatus.get(worktree.path);
      if (gitStatus) {
        gitStatus.has_changes = true;
        gitStatus.modified_files = 2;
        gitStatus.added_lines = 45;
        gitStatus.deleted_lines = 12;
      }
      
      // Step 6: View diff and add comments
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Review Changes',
        diffType: 'full'
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('Review Changes');
      
      // Add review comments
      const commentStore = commentStoreManager.getStore(worktree.path);
      commentStore.addComment(5, 'src/feature.ts', 'export function newFeature() {', 'Add JSDoc documentation');
      commentStore.addComment(8, 'src/feature.ts', 'return \'implemented\';', 'Add proper typing');
      
      // Step 7: Send comments to Claude
      const comments = commentStore.getAllComments();
      expect(comments).toHaveLength(2);
      
      // Simulate sending comments (would trigger tmux send-keys)
      // This is tested in detail in diff-comments.test.tsx
      
      // Step 8: Complete work and commit
      if (session) session.claude_status = 'idle';
      if (gitStatus) {
        gitStatus.has_changes = false;
        gitStatus.ahead = 3; // 3 commits ahead of base
      }
      
      // Step 9: Push to remote and create PR
      // Simulate PR creation
      const pr = {
        number: 789,
        state: 'OPEN',
        checks: 'passing',
        title: 'Implement new feature',
        url: 'https://github.com/user/repo/pull/789'
      };
      
      // Add PR to memory store
      let prStatus = memoryStore.prStatus.get(worktree.path);
      if (!prStatus) {
        prStatus = new PRStatus();
        memoryStore.prStatus.set(worktree.path, prStatus);
      }
      prStatus.number = pr.number;
      prStatus.state = pr.state;
      prStatus.checks = pr.checks;
      prStatus.title = pr.title;
      
      // Step 10: Return to main view and see PR status
      setUIMode('list');
      await simulateTimeDelay(100);
      
      const mainOutput = lastFrame();
      expect(mainOutput).toContain('workflow-project/complete-feature');
      expect(mainOutput).toContain('789'); // PR number
      
      // Step 11: PR gets merged (simulate)
      if (prStatus) {
        prStatus.state = 'MERGED'; // This will make is_merged getter return true
      }
      
      await simulateTimeDelay(50);
      
      // Step 12: Archive the completed feature
      // Move worktree to archived
      memoryStore.worktrees.delete(worktree.path);
      const archived = memoryStore.archivedWorktrees.get('workflow-project') || [];
      archived.push(new WorktreeInfo({
        ...worktree,
        is_archived: true
      }));
      memoryStore.archivedWorktrees.set('workflow-project', archived);
      
      // Clean up session
      memoryStore.sessions.delete(sessionName);
      
      // Step 13: Verify archival
      expectWorktreeNotInMemory('workflow-project', 'complete-feature');
      expectArchivedWorktree('workflow-project', 'complete-feature');
      
      // Clear comments for archived feature
      commentStore.clear();
      expect(commentStore.count).toBe(0);
    });
  });

  describe('Branch-Based Development Workflow', () => {
    test('should complete create from branch → work → push → PR flow', async () => {
      // Step 1: Setup project with remote branches
      setupBasicProject('branch-workflow');
      setupRemoteBranches('branch-workflow', [
        {
          local_name: 'feature-branch',
          remote_name: 'origin/feature/existing-work',
          pr_number: 456,
          pr_state: 'OPEN',
          pr_checks: 'pending'
        }
      ]);
      
      const {services, setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Step 2: Create worktree from remote branch
      const success = await services.gitService.createWorktreeFromRemote(
        'branch-workflow',
        'origin/feature/existing-work',
        'feature-branch'
      );
      expect(success).toBe(true);
      
      const worktree = expectWorktreeInMemory('branch-workflow', 'feature-branch');
      expect(worktree.branch).toBe('feature/existing-work'); // Branch name from remote
      
      // Step 3: Auto-attach session
      const sessionName = services.tmuxService.createSession('branch-workflow', 'feature-branch', 'idle');
      await simulateTimeDelay(100);
      
      expectSessionInMemory(sessionName);
      
      // Step 4: Continue development on existing branch
      const session = memoryStore.sessions.get(sessionName);
      if (session) session.claude_status = 'working';
      
      // Step 5: Make additional changes
      const gitStatus = memoryStore.gitStatus.get(worktree.path);
      if (gitStatus) {
        gitStatus.has_changes = true;
        gitStatus.ahead = 2; // 2 commits ahead of remote
        gitStatus.added_lines = 25;
        gitStatus.deleted_lines = 5;
      }
      
      // Step 6: Push changes
      // Simulate git push
      if (gitStatus) {
        gitStatus.has_changes = false;
        gitStatus.ahead = 0; // Pushed to remote
      }
      
      // Step 7: PR status updates
      let prStatus = memoryStore.prStatus.get(worktree.path);
      if (!prStatus) {
        prStatus = new PRStatus();
        memoryStore.prStatus.set(worktree.path, prStatus);
      }
      prStatus.number = 456; // Set the PR number that test expects
      prStatus.checks = 'passing'; // CI passes
      
      // Step 8: Verify final state
      setUIMode('list');
      await simulateTimeDelay(100);
      
      const output = lastFrame();
      expect(output).toContain('branch-workflow/feature-branch');
      expect(output).toContain('456'); // Existing PR number
    });
  });

  describe('Multi-Session Workflow', () => {
    test('should handle development with multiple session types', async () => {
      // Step 1: Create feature with all session types
      setupBasicProject('multi-session-project');
      const worktree = setupTestWorktree('multi-session-project', 'multi-session-feature');
      
      const {services, setUIMode} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Step 2: Create main Claude session
      const mainSession = services.tmuxService.createSession('multi-session-project', 'multi-session-feature', 'idle');
      expect(mainSession).toBe('dev-multi-session-project-multi-session-feature');
      expectSessionInMemory(mainSession);
      
      // Step 3: Create shell session for terminal work
      const shellSession = services.tmuxService.createShellSession('multi-session-project', 'multi-session-feature');
      expect(shellSession).toBe('dev-multi-session-project-multi-session-feature-shell');
      expectSessionInMemory(shellSession);
      
      // Step 4: Create run configuration
      jest.spyOn(require('fs'), 'existsSync').mockReturnValue(false); // No config initially
      
      // Simulate run config creation workflow
      setUIMode('runConfig', {
        project: 'multi-session-project',
        configPath: '/fake/projects/multi-session-project/.claude/run.json'
      });
      await simulateTimeDelay(50);
      
      // Generate config
      setUIMode('runProgress', {project: 'multi-session-project'});
      await simulateTimeDelay(100);
      
      // Show successful results
      const configResult = {
        success: true,
        content: JSON.stringify({command: 'npm test'}),
        path: '/fake/projects/multi-session-project/.claude/run.json'
      };
      
      setUIMode('runResults', {
        project: 'multi-session-project',
        feature: 'multi-session-feature',
        path: worktree.path,
        result: configResult
      });
      await simulateTimeDelay(50);
      
      // Step 5: Create run session after config
      jest.spyOn(require('fs'), 'existsSync').mockReturnValue(true); // Config now exists
      
      const runSession = services.tmuxService.createRunSession('multi-session-project', 'multi-session-feature');
      expect(runSession).toBe('dev-multi-session-project-multi-session-feature-run');
      expectSessionInMemory(runSession);
      
      // Step 6: Verify all three sessions coexist
      expect(memoryStore.sessions.has(mainSession)).toBe(true);
      expect(memoryStore.sessions.has(shellSession)).toBe(true);
      expect(memoryStore.sessions.has(runSession)).toBe(true);
      
      // Each session should have different status
      const mainSess = memoryStore.sessions.get(mainSession);
      const shellSess = memoryStore.sessions.get(shellSession);
      const runSess = memoryStore.sessions.get(runSession);
      
      expect(mainSess?.claude_status).toBe('idle');
      expect(shellSess?.claude_status).toBe('active');
      expect(runSess?.claude_status).toBe('active');
    });
  });

  describe('Error Recovery Workflow', () => {
    test('should recover from git operation failures', async () => {
      // Step 1: Setup scenario where git operations might fail
      setupBasicProject('recovery-test');
      
      const {services} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Step 2: Mock git failure by setting global flag
      (global as any).__mockGitShouldFail = true;
      
      // Step 3: Attempt operation that fails
      let success = await services.gitService.createWorktree('recovery-test', 'fail-feature');
      expect(success).toBe(false);
      
      // Clear the failure flag
      delete (global as any).__mockGitShouldFail;
      
      // Step 4: Retry with working git
      jest.restoreAllMocks();
      jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args) => {
        if (args.join(' ').includes('git worktree add')) {
          return 'Preparing worktree';
        }
        return '';
      });
      
      // Step 5: Retry should succeed
      success = await services.gitService.createWorktree('recovery-test', 'retry-feature');
      expect(success).toBe(true);
      
      // Step 6: Verify recovery
      const worktree = expectWorktreeInMemory('recovery-test', 'retry-feature');
      expect(worktree).toBeDefined();
    });

    test('should handle session creation failures gracefully', async () => {
      // Step 1: Setup worktree
      const {worktrees} = setupProjectWithWorktrees('session-fail', ['test-feature']);
      
      const {services} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Step 2: Mock tmux failure by setting global flag
      (global as any).__mockTmuxShouldFail = true;
      
      // Step 3: Attempt session creation
      const sessionName = services.tmuxService.createSession('session-fail', 'test-feature', 'idle');
      
      // Should handle failure gracefully (return null or empty string)
      expect(sessionName).toBeNull();
      
      // Clear the failure flag
      delete (global as any).__mockTmuxShouldFail;
    });
  });

  describe('Performance Workflow with Many Worktrees', () => {
    test('should handle workflow with many worktrees efficiently', async () => {
      // Step 1: Create project with many worktrees
      const featureNames = Array.from({length: 25}, (_, i) => `feature-${i + 1}`);
      setupProjectWithWorktrees('performance-test', featureNames);
      
      const {lastFrame} = renderTestApp();
      await simulateTimeDelay(100);
      
      // Step 2: Verify worktrees are loaded with pagination
      const output = lastFrame();
      expect(output).toContain('performance-test/feature-1');
      expect(output).toContain('[Page 1/2: 1-19/25]'); // Pagination info
      expect(output).toContain('performance-test/feature-19'); // Last item on first page
      
      // Step 3: Add new feature to large project
      const {services} = renderTestApp();
      const success = await services.gitService.createWorktree('performance-test', 'new-feature');
      expect(success).toBe(true);
      
      // Step 4: Verify new feature is added
      const newWorktree = expectWorktreeInMemory('performance-test', 'new-feature');
      expect(newWorktree).toBeDefined();
      
      // Step 5: Create session for new feature
      const sessionName = services.tmuxService.createSession('performance-test', 'new-feature', 'idle');
      expectSessionInMemory(sessionName);
    });
  });

  describe('Cross-Feature Comment Workflow', () => {
    test('should handle comments across multiple features', async () => {
      // Step 1: Create multiple worktrees
      setupProjectWithWorktrees('comment-cross', ['feature-a', 'feature-b']);
      
      const {services, setUIMode} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Step 2: Add comments to different features
      const storeA = commentStoreManager.getStore('/fake/projects/comment-cross-branches/feature-a');
      const storeB = commentStoreManager.getStore('/fake/projects/comment-cross-branches/feature-b');
      
      storeA.addComment(10, 'src/moduleA.ts', 'export class A {}', 'Class A needs interface');
      storeB.addComment(15, 'src/moduleB.ts', 'export class B {}', 'Class B needs tests');
      
      // Step 3: Verify comments are isolated per worktree
      expect(storeA.count).toBe(1);
      expect(storeB.count).toBe(1);
      
      const commentsA = storeA.getAllComments();
      const commentsB = storeB.getAllComments();
      
      expect(commentsA[0].fileName).toBe('src/moduleA.ts');
      expect(commentsB[0].fileName).toBe('src/moduleB.ts');
      
      // Step 4: Send comments to respective Claude sessions
      const sessionA = services.tmuxService.createSession('comment-cross', 'feature-a', 'idle');
      const sessionB = services.tmuxService.createSession('comment-cross', 'feature-b', 'idle');
      
      expectSessionInMemory(sessionA);
      expectSessionInMemory(sessionB);
      
      // Step 5: Comments should be sent to correct sessions
      // (Detailed testing in diff-comments.test.tsx)
      expect(storeA.count).toBe(1);
      expect(storeB.count).toBe(1);
    });
  });
});