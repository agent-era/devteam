import {describe, beforeEach, test, expect, jest} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {
  resetTestData,
  setupBasicProject,
  setupProjectWithWorktrees,
  simulateTimeDelay,
  memoryStore,
} from '../utils/testHelpers.js';
import {SessionInfo} from '../../src/models.js';

describe('UI Dialogs E2E', () => {
  beforeEach(() => {
    resetTestData();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Create Feature Dialog', () => {
    test('should display create feature dialog with project selection', async () => {
      // Setup: Multiple projects for selection
      setupBasicProject('project-alpha');
      setupBasicProject('project-beta');
      setupBasicProject('project-gamma');
      
      const projects = [
        {name: 'project-alpha', path: '/fake/projects/project-alpha'},
        {name: 'project-beta', path: '/fake/projects/project-beta'},
        {name: 'project-gamma', path: '/fake/projects/project-gamma'}
      ];
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open create feature dialog
      setUIMode('create', {
        projects,
        defaultProject: 'project-alpha'
      });
      await simulateTimeDelay(50);
      
      // Should show create feature dialog
      const output = lastFrame();
      expect(output).toContain('Create Feature');
      expect(output).toContain('project-alpha');
      expect(output).toContain('project-beta');
      expect(output).toContain('project-gamma');
    });

    test('should validate feature name input', async () => {
      // Setup: Project for feature creation
      setupBasicProject('validation-project');
      
      const projects = [{name: 'validation-project', path: '/fake/projects/validation-project'}];
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open create dialog
      setUIMode('create', {
        projects,
        defaultProject: 'validation-project',
        featureName: '',
        validationError: null
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('Create Feature');
      expect(lastFrame()).toContain('Feature Name');
      
      // Simulate validation error for invalid name
      setUIMode('create', {
        projects,
        defaultProject: 'validation-project',
        featureName: 'invalid name with spaces',
        validationError: 'Feature name cannot contain spaces'
      });
      await simulateTimeDelay(50);
      
      // Should show validation error
      const errorOutput = lastFrame();
      expect(errorOutput).toContain('Feature name cannot contain spaces');
      
      // Simulate valid name
      setUIMode('create', {
        projects,
        defaultProject: 'validation-project',
        featureName: 'valid-feature-name',
        validationError: null
      });
      await simulateTimeDelay(50);
      
      // Should not show error
      const validOutput = lastFrame();
      expect(validOutput).not.toContain('cannot contain spaces');
      expect(validOutput).toContain('valid-feature-name');
    });

    test('should handle project switching in create dialog', async () => {
      // Setup: Multiple projects
      setupBasicProject('switch-from');
      setupBasicProject('switch-to');
      
      const projects = [
        {name: 'switch-from', path: '/fake/projects/switch-from'},
        {name: 'switch-to', path: '/fake/projects/switch-to'}
      ];
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Start with first project
      setUIMode('create', {
        projects,
        defaultProject: 'switch-from',
        selectedProjectIndex: 0
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('switch-from');
      
      // Switch to second project
      setUIMode('create', {
        projects,
        defaultProject: 'switch-to',
        selectedProjectIndex: 1
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('switch-to');
    });

    test('should cancel create feature dialog', async () => {
      // Setup: Create dialog open
      setupBasicProject('cancel-project');
      const projects = [{name: 'cancel-project', path: '/fake/projects/cancel-project'}];
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open create dialog
      setUIMode('create', {
        projects,
        defaultProject: 'cancel-project'
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('Create Feature');
      
      // Cancel (return to list)
      setUIMode('list');
      await simulateTimeDelay(50);
      
      // Should be back to main view
      expect(lastFrame()).not.toContain('Create Feature');
    });
  });

  describe('Archive Confirmation Dialog', () => {
    test('should display archive confirmation with worktree details', async () => {
      // Setup: Worktree to archive
      const {worktrees} = setupProjectWithWorktrees('archive-project', ['archive-me']);
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open archive confirmation
      setUIMode('confirmArchive', {
        worktree: worktrees[0],
        project: 'archive-project',
        feature: 'archive-me',
        path: worktrees[0].path
      });
      await simulateTimeDelay(50);
      
      // Should show confirmation dialog
      const output = lastFrame();
      expect(output).toContain('Archive');
      expect(output).toContain('archive-project');
      expect(output).toContain('archive-me');
      expect(output).toContain('Are you sure');
    });

    test('should show warning about session cleanup in archive dialog', async () => {
      // Setup: Worktree with active session
      const {worktrees} = setupProjectWithWorktrees('session-cleanup', ['active-feature']);
      
      // Mock active session
      const sessionName = 'dev-session-cleanup-active-feature';
      memoryStore.sessions.set(sessionName, new SessionInfo({
        session_name: sessionName,
        attached: true,
        claude_status: 'working'
      }));
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open archive confirmation
      setUIMode('confirmArchive', {
        worktree: worktrees[0],
        project: 'session-cleanup',
        feature: 'active-feature',
        path: worktrees[0].path,
        hasActiveSession: true
      });
      await simulateTimeDelay(50);
      
      // Should show session warning
      const output = lastFrame();
      expect(output).toContain('Archive');
      expect(output).toContain('active session'); // Warning about session
    });

    test('should cancel archive operation', async () => {
      // Setup: Archive confirmation dialog
      const {worktrees} = setupProjectWithWorktrees('cancel-archive', ['keep-me']);
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open archive confirmation
      setUIMode('confirmArchive', {
        worktree: worktrees[0],
        project: 'cancel-archive',
        feature: 'keep-me',
        path: worktrees[0].path
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('Archive');
      
      // Cancel archive
      setUIMode('list');
      await simulateTimeDelay(50);
      
      // Should return to main view, worktree still active
      expect(lastFrame()).toContain('cancel-archive/keep-me');
      expect(memoryStore.worktrees.size).toBeGreaterThan(0);
    });
  });

  describe('Help Overlay', () => {
    test('should display comprehensive help information', async () => {
      // Setup: Main view
      setupProjectWithWorktrees('help-project', ['some-feature']);
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open help overlay
      setUIMode('help');
      await simulateTimeDelay(50);
      
      // Should show help content with keyboard shortcuts
      const output = lastFrame();
      expect(output).toContain('Help');
      expect(output).toContain('Keyboard Shortcuts');
      
      // Should show navigation keys
      expect(output).toContain('j/k'); // Navigation
      expect(output).toContain('Enter'); // Select
      
      // Should show action keys
      expect(output).toContain('n'); // New feature
      expect(output).toContain('a'); // Archive
      expect(output).toContain('v'); // View archived
      expect(output).toContain('b'); // Branch picker
      expect(output).toContain('s'); // Shell session
      expect(output).toContain('d'); // Diff
      expect(output).toContain('D'); // Uncommitted diff
      expect(output).toContain('x'); // Execute run
      expect(output).toContain('X'); // Configure run
      expect(output).toContain('r'); // Refresh
      expect(output).toContain('?'); // Help
      expect(output).toContain('q'); // Quit
    });

    test('should show column explanations in help', async () => {
      // Setup: Help overlay
      setupProjectWithWorktrees('help-columns', ['test-feature']);
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open help
      setUIMode('help');
      await simulateTimeDelay(50);
      
      // Should explain column meanings
      const output = lastFrame();
      expect(output).toContain('AI'); // AI status column
      expect(output).toContain('DIFF'); // Diff column
      expect(output).toContain('CHANGES'); // Changes column
      expect(output).toContain('PR'); // PR column
      
      // Should explain status symbols
      expect(output).toContain('idle'); // Symbol meanings
      expect(output).toContain('working');
      expect(output).toContain('waiting');
    });

    test('should close help overlay and return to main view', async () => {
      // Setup: Help open
      setupProjectWithWorktrees('close-help', ['feature-1']);
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open help
      setUIMode('help');
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('Help');
      
      // Close help (escape key simulation)
      setUIMode('list');
      await simulateTimeDelay(50);
      
      // Should return to main view
      expect(lastFrame()).toContain('close-help/feature-1');
      expect(lastFrame()).not.toContain('Keyboard Shortcuts');
    });
  });

  describe('Project Picker Dialog', () => {
    test('should display project picker for branch creation', async () => {
      // Setup: Multiple projects for branch picker
      setupBasicProject('picker-project-1');
      setupBasicProject('picker-project-2');
      setupBasicProject('picker-project-3');
      
      const projects = [
        {name: 'picker-project-1', path: '/fake/projects/picker-project-1'},
        {name: 'picker-project-2', path: '/fake/projects/picker-project-2'},
        {name: 'picker-project-3', path: '/fake/projects/picker-project-3'}
      ];
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open project picker
      setUIMode('pickProjectForBranch', {
        projects,
        defaultProject: 'picker-project-1'
      });
      await simulateTimeDelay(50);
      
      // Should show project selection
      const output = lastFrame();
      expect(output).toContain('Select Project');
      expect(output).toContain('picker-project-1');
      expect(output).toContain('picker-project-2');
      expect(output).toContain('picker-project-3');
    });

    test('should navigate project picker list', async () => {
      // Setup: Projects for navigation
      const projects = [
        {name: 'nav-project-a', path: '/fake/projects/nav-project-a'},
        {name: 'nav-project-b', path: '/fake/projects/nav-project-b'},
        {name: 'nav-project-c', path: '/fake/projects/nav-project-c'}
      ];
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Start with first project selected
      setUIMode('pickProjectForBranch', {
        projects,
        defaultProject: 'nav-project-a',
        selectedIndex: 0
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('nav-project-a');
      
      // Navigate to second project
      setUIMode('pickProjectForBranch', {
        projects,
        defaultProject: 'nav-project-b',
        selectedIndex: 1
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('nav-project-b');
      
      // Navigate to third project
      setUIMode('pickProjectForBranch', {
        projects,
        defaultProject: 'nav-project-c',
        selectedIndex: 2
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('nav-project-c');
    });

    test('should transition from project picker to branch picker', async () => {
      // Setup: Project picker -> branch picker flow
      const projects = [{name: 'transition-project', path: '/fake/projects/transition-project'}];
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Start with project picker
      setUIMode('pickProjectForBranch', {
        projects,
        defaultProject: 'transition-project'
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('Select Project');
      expect(lastFrame()).toContain('transition-project');
      
      // Select project and move to branch picker
      setUIMode('pickBranch', {
        project: 'transition-project',
        branches: [
          {name: 'feature/branch-for-project', remoteName: 'origin/feature/branch-for-project'}
        ]
      });
      await simulateTimeDelay(50);
      
      // Should now show branch picker
      const branchOutput = lastFrame();
      expect(branchOutput).toContain('feature/branch-for-project');
      expect(branchOutput).not.toContain('Select Project');
    });
  });

  describe('Comment Input Dialog', () => {
    test('should display comment input dialog with context', async () => {
      // Setup: Comment input scenario
      const {worktrees} = setupProjectWithWorktrees('comment-input', ['comment-feature']);
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open comment input dialog
      setUIMode('commentInput', {
        title: 'Add Comment',
        fileName: 'src/example.ts',
        lineIndex: 42,
        lineText: 'function calculateTotal(items: Item[]) {',
        placeholder: 'Enter your comment...'
      });
      await simulateTimeDelay(50);
      
      // Should show comment dialog with context
      const output = lastFrame();
      expect(output).toContain('Add Comment');
      expect(output).toContain('src/example.ts');
      expect(output).toContain('Line 42');
      expect(output).toContain('function calculateTotal');
    });

    test('should validate comment input before submission', async () => {
      // Setup: Comment input with validation
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open comment input
      setUIMode('commentInput', {
        title: 'Add Comment',
        fileName: 'src/validate.ts',
        lineIndex: 10,
        lineText: 'const value = getData();',
        commentText: '',
        validationError: null
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('Add Comment');
      
      // Simulate empty comment validation error
      setUIMode('commentInput', {
        title: 'Add Comment',
        fileName: 'src/validate.ts',
        lineIndex: 10,
        lineText: 'const value = getData();',
        commentText: '',
        validationError: 'Comment cannot be empty'
      });
      await simulateTimeDelay(50);
      
      // Should show validation error
      const errorOutput = lastFrame();
      expect(errorOutput).toContain('Comment cannot be empty');
      
      // Simulate valid comment
      setUIMode('commentInput', {
        title: 'Add Comment',
        fileName: 'src/validate.ts',
        lineIndex: 10,
        lineText: 'const value = getData();',
        commentText: 'Add error handling for getData()',
        validationError: null
      });
      await simulateTimeDelay(50);
      
      // Should not show error
      const validOutput = lastFrame();
      expect(validOutput).not.toContain('cannot be empty');
      expect(validOutput).toContain('Add error handling');
    });

    test('should cancel comment input', async () => {
      // Setup: Comment input dialog
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open comment input
      setUIMode('commentInput', {
        title: 'Add Comment',
        fileName: 'src/cancel.ts',
        lineIndex: 5,
        lineText: 'return result;'
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('Add Comment');
      
      // Cancel comment input (return to diff view)
      setUIMode('diff', {
        worktreePath: '/fake/projects/test-branches/test-feature',
        title: 'Diff Viewer',
        diffType: 'full'
      });
      await simulateTimeDelay(50);
      
      // Should return to diff view
      expect(lastFrame()).toContain('Diff Viewer');
      expect(lastFrame()).not.toContain('Add Comment');
    });
  });

  describe('Progress Dialog', () => {
    test('should display progress during long operations', async () => {
      // Setup: Long-running operation
      setupBasicProject('progress-project');
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Show progress dialog
      setUIMode('runProgress', {
        title: 'Generating Configuration',
        message: 'Claude is analyzing your project and generating run configuration...',
        project: 'progress-project'
      });
      await simulateTimeDelay(50);
      
      // Should show progress indication
      const output = lastFrame();
      expect(output).toContain('Generating Configuration');
      expect(output).toContain('Claude is analyzing');
      expect(output).toContain('progress-project');
    });

    test('should show progress with spinner or loading indicator', async () => {
      // Setup: Progress dialog with animation
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Show progress
      setUIMode('runProgress', {
        title: 'Processing',
        message: 'Please wait while the operation completes...',
        showSpinner: true
      });
      await simulateTimeDelay(50);
      
      // Should show progress elements
      const output = lastFrame();
      expect(output).toContain('Processing');
      expect(output).toContain('Please wait');
    });
  });

  describe('Configuration Results Dialog', () => {
    test('should display successful configuration results', async () => {
      // Setup: Successful config generation
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Show success results
      setUIMode('runResults', {
        result: {
          success: true,
          content: JSON.stringify({
            name: 'Test Suite',
            command: 'npm test',
            description: 'Run all tests'
          }),
          path: '/fake/projects/success-project/.claude/run.json'
        },
        project: 'success-project',
        feature: 'success-feature'
      });
      await simulateTimeDelay(50);
      
      // Should show success message and content
      const output = lastFrame();
      expect(output).toContain('Success');
      expect(output).toContain('npm test');
      expect(output).toContain('.claude/run.json');
      expect(output).toContain('Test Suite');
    });

    test('should display configuration error results', async () => {
      // Setup: Failed config generation
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Show error results
      setUIMode('runResults', {
        result: {
          success: false,
          content: null,
          path: '/fake/projects/error-project/.claude/run.json',
          error: 'Failed to analyze project: No package.json found'
        },
        project: 'error-project',
        feature: 'error-feature'
      });
      await simulateTimeDelay(50);
      
      // Should show error message
      const output = lastFrame();
      expect(output).toContain('Error');
      expect(output).toContain('Failed to analyze project');
      expect(output).toContain('No package.json found');
    });

    test('should close results dialog and return to main view', async () => {
      // Setup: Results dialog open
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Show results
      setUIMode('runResults', {
        result: {success: true, content: '{}', path: '/fake/path'},
        project: 'close-project',
        feature: 'close-feature'
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('Success');
      
      // Close results
      setUIMode('list');
      await simulateTimeDelay(50);
      
      // Should return to main view
      expect(lastFrame()).not.toContain('Success');
    });
  });

  describe('Dialog Stacking and Navigation', () => {
    test('should handle nested dialog navigation', async () => {
      // Setup: Multiple dialog scenario
      setupBasicProject('nested-project');
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Start from main view
      expect(lastFrame()).not.toContain('Create Feature');
      
      // Open create feature dialog
      setUIMode('create', {
        projects: [{name: 'nested-project', path: '/fake/projects/nested-project'}],
        defaultProject: 'nested-project'
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('Create Feature');
      
      // Open help from create dialog (nested dialog)
      setUIMode('help');
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('Help');
      expect(lastFrame()).not.toContain('Create Feature');
      
      // Close help, should return to main view (not create dialog)
      setUIMode('list');
      await simulateTimeDelay(50);
      
      expect(lastFrame()).not.toContain('Help');
      expect(lastFrame()).not.toContain('Create Feature');
    });

    test('should handle dialog escape sequences correctly', async () => {
      // Setup: Dialog chain
      setupProjectWithWorktrees('escape-project', ['escape-feature']);
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Main -> Archive Confirmation -> Help -> Back to Main
      setUIMode('confirmArchive', {
        project: 'escape-project',
        feature: 'escape-feature',
        path: '/fake/path'
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('Archive');
      
      // Escape should go back to main view
      setUIMode('list');
      await simulateTimeDelay(50);
      
      // Should be back to main list
      expect(lastFrame()).toContain('escape-project/escape-feature');
      expect(lastFrame()).not.toContain('Archive');
    });
  });
});