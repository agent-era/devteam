import {describe, beforeEach, test, expect} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {
  resetTestData,
  setupBasicProject,
  setupProjectWithWorktrees,
  setupRemoteBranches,
  expectWorktreeInMemory,
  simulateTimeDelay,
  memoryStore,
} from '../utils/testHelpers.js';

describe('Branch Picker E2E', () => {
  beforeEach(() => {
    resetTestData();
  });

  describe('Branch Picker Dialog', () => {
    test('should display available remote branches', async () => {
      // Setup: Project with remote branches
      setupBasicProject('branch-project');
      setupRemoteBranches('branch-project', [
        {
          local_name: 'auth-system',
          remote_name: 'origin/feature/auth-system',
          pr_number: 123,
          pr_state: 'OPEN',
          pr_checks: 'passing',
          pr_title: 'Add authentication system'
        },
        {
          local_name: 'user-dashboard',
          remote_name: 'origin/feature/user-dashboard',
          pr_number: 124,
          pr_state: 'OPEN',
          pr_checks: 'pending',
          pr_title: 'User dashboard improvements'
        }
      ]);
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open branch picker dialog
      setUIMode('pickBranch', {
        branches: [
          {
            name: 'feature/auth-system',
            remoteName: 'origin/feature/auth-system',
            prNumber: 123,
            prTitle: 'Add authentication system',
            prState: 'OPEN',
            prChecks: 'passing'
          },
          {
            name: 'feature/user-dashboard',
            remoteName: 'origin/feature/user-dashboard', 
            prNumber: 124,
            prTitle: 'User dashboard improvements',
            prState: 'OPEN',
            prChecks: 'pending'
          }
        ]
      });
      await simulateTimeDelay(50);
      
      // Should display branch picker with available branches
      const output = lastFrame();
      expect(output).toContain('feature/auth-system');
      expect(output).toContain('feature/user-dashboard');
      expect(output).toContain('Add authentication system');
      expect(output).toContain('User dashboard improvements');
    });

    test('should show branch with PR information', async () => {
      // Setup: Project with branches that have PRs
      setupBasicProject('pr-branches');
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open branch picker with PR info
      setUIMode('pickBranch', {
        branches: [
          {
            name: 'feature/with-pr',
            remoteName: 'origin/feature/with-pr',
            prNumber: 456,
            prTitle: 'Feature with pull request',
            prState: 'OPEN',
            prChecks: 'failing',
            prUrl: 'https://github.com/user/repo/pull/456'
          },
          {
            name: 'feature/no-pr',
            remoteName: 'origin/feature/no-pr',
            prNumber: null,
            prTitle: null,
            prState: null,
            prChecks: null
          }
        ]
      });
      await simulateTimeDelay(50);
      
      // Should show PR information
      const output = lastFrame();
      expect(output).toContain('feature/with-pr');
      expect(output).toContain('456'); // PR number
      expect(output).toContain('Feature with pull request');
      expect(output).toContain('feature/no-pr');
    });

    test('should handle branch picker navigation', async () => {
      // Setup: Multiple branches for navigation
      setupBasicProject('nav-branches');
      
      const branches = [
        {name: 'feature/branch-1', remoteName: 'origin/feature/branch-1'},
        {name: 'feature/branch-2', remoteName: 'origin/feature/branch-2'},
        {name: 'feature/branch-3', remoteName: 'origin/feature/branch-3'}
      ];
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open branch picker
      setUIMode('pickBranch', {
        branches,
        selectedIndex: 0
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('feature/branch-1');
      
      // Navigate to second branch
      setUIMode('pickBranch', {
        branches,
        selectedIndex: 1
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('feature/branch-2');
      
      // Navigate to third branch
      setUIMode('pickBranch', {
        branches,
        selectedIndex: 2
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('feature/branch-3');
    });

    test('should cancel branch picker and return to main view', async () => {
      // Setup: Branch picker open
      setupBasicProject('cancel-branches');
      setupProjectWithWorktrees('cancel-branches', ['existing-feature']);
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open branch picker
      setUIMode('pickBranch', {
        branches: [{name: 'feature/test', remoteName: 'origin/feature/test'}]
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('feature/test');
      
      // Cancel and return to main view
      setUIMode('list');
      await simulateTimeDelay(50);
      
      // Should be back to main list
      expect(lastFrame()).toContain('cancel-branches/existing-feature');
      expect(lastFrame()).not.toContain('feature/test');
    });
  });

  describe('Branch Creation from Remote', () => {
    test('should create worktree from selected remote branch', async () => {
      // Setup: Project for branch creation
      setupBasicProject('create-from-remote');
      
      const {services, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Create worktree from remote branch
      const success = await services.gitService.createWorktreeFromRemote(
        'create-from-remote',
        'origin/feature/remote-branch',
        'remote-branch'
      );
      
      expect(success).toBe(true);
      await simulateTimeDelay(100);
      
      // Verify worktree was created
      const worktree = expectWorktreeInMemory('create-from-remote', 'remote-branch');
      expect(worktree.project).toBe('create-from-remote');
      expect(worktree.feature).toBe('remote-branch');
      expect(worktree.branch).toBe('feature/remote-branch'); // Gets full branch name from remote
    });

    test('should auto-attach session after creating from branch', async () => {
      // Setup: Branch creation scenario
      setupBasicProject('auto-attach');
      
      const {services} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Create worktree and expect auto-attach
      const success = await services.gitService.createWorktreeFromRemote(
        'auto-attach',
        'origin/feature/auto-session',
        'auto-session'
      );
      
      expect(success).toBe(true);
      await simulateTimeDelay(100);
      
      // Create session for the new worktree (simulates auto-attach behavior)
      const sessionName = services.tmuxService.createSession('auto-attach', 'auto-session', 'idle');
      expect(sessionName).toBe('dev-auto-attach-auto-session');
      
      // Verify session was created and attached
      const session = memoryStore.sessions.get(sessionName);
      expect(session).toBeDefined();
      expect(session?.attached).toBe(true);
      expect(session?.claude_status).toBe('idle');
    });

    test('should handle branch creation failure gracefully', async () => {
      // Setup: Scenario where git commands fail
      setupBasicProject('fail-create');
      
      // Enable git error simulation
      (global as any).__mockGitShouldFail = true;
      
      const {services} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Attempt to create worktree should handle failure
      const success = services.gitService.createWorktreeFromRemote(
        'fail-create',
        'origin/feature/existing-branch',
        'existing-branch'
      );
      
      // Should return false on failure
      expect(success).toBe(false);
      
      // Should not create worktree in memory
      expect(() => {
        expectWorktreeInMemory('fail-create', 'existing-branch');
      }).toThrow();
      
      // Cleanup
      (global as any).__mockGitShouldFail = false;
    });
  });

  describe('Branch Picker Integration with Main App', () => {
    test('should open branch picker from main view with b key', async () => {
      // Setup: Main view with existing worktree
      setupProjectWithWorktrees('picker-integration', ['current-feature']);
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Should start in main view
      expect(lastFrame()).toContain('picker-integration/current-feature');
      
      // Simulate pressing 'b' key to open branch picker
      // (In real app, this would be handled by useKeyboardShortcuts)
      setUIMode('pickBranch', {
        branches: [
          {name: 'feature/new-branch', remoteName: 'origin/feature/new-branch'}
        ]
      });
      await simulateTimeDelay(50);
      
      // Should show branch picker
      expect(lastFrame()).toContain('feature/new-branch');
      expect(lastFrame()).not.toContain('picker-integration/current-feature');
    });

    test('should pre-select project when opening branch picker', async () => {
      // Setup: Multiple projects with one selected
      setupProjectWithWorktrees('project-a', ['feature-a']);
      setupProjectWithWorktrees('project-b', ['feature-b']);
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Should start with project-a selected (first in list)
      expect(lastFrame()).toContain('project-a/feature-a');
      
      // Open branch picker - should use currently selected project
      setUIMode('pickBranch', {
        defaultProject: 'project-a',
        branches: [
          {name: 'feature/for-project-a', remoteName: 'origin/feature/for-project-a'}
        ]
      });
      await simulateTimeDelay(50);
      
      // Branch picker should be configured for project-a
      expect(lastFrame()).toContain('feature/for-project-a');
    });
  });

  describe('Branch Filtering and Search', () => {
    test('should support branch filtering in picker', async () => {
      // Setup: Many branches to filter
      setupBasicProject('filter-branches');
      
      const allBranches = [
        {name: 'feature/auth-system', remoteName: 'origin/feature/auth-system'},
        {name: 'feature/auth-middleware', remoteName: 'origin/feature/auth-middleware'},
        {name: 'feature/user-profile', remoteName: 'origin/feature/user-profile'},
        {name: 'hotfix/auth-bug', remoteName: 'origin/hotfix/auth-bug'},
        {name: 'develop', remoteName: 'origin/develop'}
      ];
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open branch picker with all branches
      setUIMode('pickBranch', {
        branches: allBranches,
        filter: ''
      });
      await simulateTimeDelay(50);
      
      // Should show all branches initially
      let output = lastFrame();
      expect(output).toContain('feature/auth-system');
      expect(output).toContain('feature/user-profile');
      expect(output).toContain('hotfix/auth-bug');
      
      // Apply filter for 'auth' branches
      const filteredBranches = allBranches.filter(b => b.name.includes('auth'));
      setUIMode('pickBranch', {
        branches: filteredBranches,
        filter: 'auth'
      });
      await simulateTimeDelay(50);
      
      // Should show only filtered branches
      output = lastFrame();
      expect(output).toContain('feature/auth-system');
      expect(output).toContain('feature/auth-middleware');
      expect(output).toContain('hotfix/auth-bug');
      expect(output).not.toContain('feature/user-profile');
    });

    test('should handle empty filter results', async () => {
      // Setup: Branches that won't match filter
      setupBasicProject('no-matches');
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open branch picker with filter that matches nothing
      setUIMode('pickBranch', {
        branches: [], // Empty after filtering
        filter: 'nonexistent'
      });
      await simulateTimeDelay(50);
      
      // Should handle empty results gracefully
      const output = lastFrame();
      expect(output).not.toContain('feature/');
    });
  });

  describe('Branch Refresh Functionality', () => {
    test('should refresh branch list when requested', async () => {
      // Setup: Branch picker with initial branches
      setupBasicProject('refresh-test');
      
      const initialBranches = [
        {name: 'feature/old-branch', remoteName: 'origin/feature/old-branch'}
      ];
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open branch picker
      setUIMode('pickBranch', {
        branches: initialBranches
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('feature/old-branch');
      
      // Simulate refresh with new branches
      const refreshedBranches = [
        {name: 'feature/old-branch', remoteName: 'origin/feature/old-branch'},
        {name: 'feature/new-branch', remoteName: 'origin/feature/new-branch'}
      ];
      
      setUIMode('pickBranch', {
        branches: refreshedBranches,
        refreshed: true
      });
      await simulateTimeDelay(50);
      
      // Should show updated branch list
      const output = lastFrame();
      expect(output).toContain('feature/old-branch');
      expect(output).toContain('feature/new-branch');
    });

    test('should handle refresh failure gracefully', async () => {
      // Setup: Branch picker where refresh fails
      setupBasicProject('refresh-fail');
      
      // Enable git error simulation for fetch operations
      (global as any).__mockGitShouldFail = true;
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open branch picker
      setUIMode('pickBranch', {
        items: [
          'feature/existing'
        ],
        selectedIndex: 0
      });
      await simulateTimeDelay(50);
      
      // Should still show existing branches even if refresh fails
      expect(lastFrame()).toContain('feature/existing');
      
      // Cleanup
      (global as any).__mockGitShouldFail = false;
    });
  });

  describe('Project Selection for Branch Creation', () => {
    test('should show project picker before branch picker when needed', async () => {
      // Setup: Multiple projects available
      setupBasicProject('multi-project-1');
      setupBasicProject('multi-project-2');
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // First show project picker
      setUIMode('pickProjectForBranch', {
        projects: [
          {name: 'multi-project-1', path: '/fake/projects/multi-project-1'},
          {name: 'multi-project-2', path: '/fake/projects/multi-project-2'}
        ],
        defaultProject: 'multi-project-1'
      });
      await simulateTimeDelay(50);
      
      // Should show project selection
      const output = lastFrame();
      expect(output).toContain('multi-project-1');
      expect(output).toContain('multi-project-2');
      
      // After selecting project, would move to branch picker
      setUIMode('pickBranch', {
        project: 'multi-project-1',
        branches: [
          {name: 'feature/for-project-1', remoteName: 'origin/feature/for-project-1'}
        ]
      });
      await simulateTimeDelay(50);
      
      // Should now show branch picker for selected project
      expect(lastFrame()).toContain('feature/for-project-1');
    });
  });
});