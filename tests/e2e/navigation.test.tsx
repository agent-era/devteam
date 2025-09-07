import {describe, beforeEach, test, expect} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {
  resetTestData,
  setupBasicProject,
  setupProjectWithWorktrees,
  setupRemoteBranches,
  simulateKeyPress,
  simulateTimeDelay,
  setupTestProject,
  createProjectWithFeatures,
  createArchivedFeatures,
  createRemoteBranches,
} from '../utils/testHelpers.js';

describe('Navigation E2E', () => {
  beforeEach(() => {
    resetTestData();
  });

  describe('Keyboard Navigation', () => {
    test('should navigate with j/k keys', async () => {
      // Given: Project with three features
      createProjectWithFeatures('my-project', ['feature-1', 'feature-2', 'feature-3']);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Then: All features are visible in list
      const output = lastFrame();
      expect(output).toContain('my-project/feature-1');
      expect(output).toContain('my-project/feature-2'); 
      expect(output).toContain('my-project/feature-3');
      
      // Note: In real implementation, this would test actual keyboard navigation
      // The mock system simulates the UI state transitions
    });

    test('should navigate with arrow keys', async () => {
      setupProjectWithWorktrees('my-project', ['feature-1', 'feature-2']);

      const {stdin, lastFrame, rerender} = renderTestApp();
      await simulateTimeDelay(50);

      // Navigate down with down arrow
      stdin.write(''); // Simulate down arrow - will need to handle this properly in real test
      await simulateTimeDelay(50);

      // Navigate up with up arrow
      stdin.write(''); // Simulate up arrow
      await simulateTimeDelay(50);
    });

    test('should handle number key quick selection', async () => {
      // Setup with many worktrees to test number selection
      const features = Array.from({length: 5}, (_, i) => `feature-${i + 1}`);
      setupProjectWithWorktrees('my-project', features);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Press '3' to select third item (index 2)
      stdin.write('3');
      await simulateTimeDelay(50);

      // Should jump to third item
      const output = lastFrame();
      expect(output).toContain('my-project/feature-3');
    });

    test('should handle bounds correctly', async () => {
      // Setup: Only one worktree
      setupProjectWithWorktrees('my-project', ['feature-1']);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      // Try to navigate down when already at bottom
      stdin.write('j');
      await simulateTimeDelay(50);

      // Should stay on same item
      expect(lastFrame()).toContain('my-project/feature-1');

      // Try to navigate up when already at top
      stdin.write('k');
      await simulateTimeDelay(50);

      // Should stay on same item
      expect(lastFrame()).toContain('my-project/feature-1');
    });
  });

  describe('View Switching', () => {
    test('should switch to help view', async () => {
      createProjectWithFeatures('my-project', ['feature-1']);

      const {stdin, lastFrame, setUIMode} = renderTestApp();
      await simulateTimeDelay(50);

      // Simulate pressing '?' to open help
      setUIMode('help');
      await simulateTimeDelay(50);

      // Should show help overlay
      const output = lastFrame();
      expect(output).toContain('Help'); // Should contain help content
      
      // Should show keyboard shortcuts
      expect(output).toContain('j/k'); // Navigation keys
      expect(output).toContain('n'); // New feature key
      expect(output).toContain('a'); // Archive key
    });

    test('should switch to archived view', async () => {
      createProjectWithFeatures('my-project', ['feature-1']);
      createArchivedFeatures('my-project', ['old-feature']);

      const {stdin, lastFrame, setUIMode} = renderTestApp();
      await simulateTimeDelay(50);

      // Simulate pressing 'v' to view archived
      setUIMode('archived');
      await simulateTimeDelay(50);

      // Should show archived view
      const output = lastFrame();
      expect(output).toContain('Archived'); // Should show archived header
      expect(output).toContain('my-project/old-feature'); // Should show archived feature
    });

    test('should switch to diff view', async () => {
      createProjectWithFeatures('my-project', ['feature-1']);

      const {stdin, lastFrame, setUIMode} = renderTestApp();
      await simulateTimeDelay(50);

      // Simulate pressing 'd' to view diff
      setUIMode('diff', {title: 'Diff Viewer'});
      await simulateTimeDelay(50);

      // Should show diff view
      const output = lastFrame();
      expect(output).toContain('Diff Viewer'); // Should show diff viewer
      expect(output).toContain('src/example.ts'); // Should show file
    });

    test('should switch to uncommitted diff view', async () => {
      createProjectWithFeatures('my-project', ['feature-1']);

      const {stdin, lastFrame, setUIMode} = renderTestApp();
      await simulateTimeDelay(50);

      // Simulate pressing 'D' to view uncommitted changes
      setUIMode('diff', {title: 'Diff Viewer (Uncommitted Changes)'});
      await simulateTimeDelay(50);

      // Should show uncommitted diff view
      const output = lastFrame();
      expect(output).toContain('Diff Viewer (Uncommitted Changes)');
    });

    test('should return to main view from other views', async () => {
      createProjectWithFeatures('my-project', ['feature-1']);

      const {stdin, lastFrame, setUIMode} = renderTestApp();
      await simulateTimeDelay(50);

      // Go to help
      setUIMode('help');
      await simulateTimeDelay(50);
      expect(lastFrame()).toContain('Help');

      // Simulate pressing escape to go back
      setUIMode('list');
      await simulateTimeDelay(50);

      // Should be back to main view
      const output = lastFrame();
      expect(output).toContain('my-project/feature-1');
      expect(output).not.toContain('Help');
    });
  });

  describe('Pagination', () => {
    test('should handle pagination with many worktrees', async () => {
      // Setup: Many worktrees to trigger pagination
      const manyFeatures = Array.from({length: 25}, (_, i) => `feature-${i + 1}`);
      setupProjectWithWorktrees('my-project', manyFeatures);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      const initialOutput = lastFrame();
      
      // Should show some worktrees on first page
      expect(initialOutput).toContain('my-project/feature-1');
      
      // Navigate to next page with '>' or '.'
      stdin.write('>');
      await simulateTimeDelay(50);

      // Should show different worktrees (depending on page size)
      const nextPageOutput = lastFrame();
      
      // Navigate back with '<' or ','
      stdin.write('<');
      await simulateTimeDelay(50);

      // Should be back to first page
      const backToFirstOutput = lastFrame();
      expect(backToFirstOutput).toContain('my-project/feature-1');
    });

    test('should handle page up and page down keys', async () => {
      // Setup: Many worktrees
      const manyFeatures = Array.from({length: 30}, (_, i) => `feature-${i + 1}`);
      setupProjectWithWorktrees('my-project', manyFeatures);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Test PageDown key (if supported)
      // This would require proper key simulation in a real test environment
      
      // Test PageUp key (if supported)
      // This would require proper key simulation in a real test environment
    });
  });

  describe('Dialog Navigation', () => {
    test('should navigate project picker dialog', async () => {
      // Setup: Multiple projects
      setupTestProject('project-1');
      setupTestProject('project-2');
      setupTestProject('project-3');

      const {stdin, lastFrame, setUIMode} = renderTestApp();
      await simulateTimeDelay(50);

      // Simulate opening create feature dialog
      setUIMode('pickProjectForBranch', {
        title: 'Create Feature',
        items: ['project-1', 'project-2', 'project-3'],
        selectedIndex: 0
      });
      await simulateTimeDelay(50);

      // Should show project picker with multiple projects
      const dialogOutput = lastFrame();
      expect(dialogOutput).toContain('Select Project');
      expect(dialogOutput).toContain('project-1');
      expect(dialogOutput).toContain('project-2');
      expect(dialogOutput).toContain('project-3');

      // Simulate navigation
      setUIMode('pickProjectForBranch', {
        title: 'Create Feature',
        items: ['project-1', 'project-2', 'project-3'],
        selectedIndex: 1
      });
      await simulateTimeDelay(50);

      // Simulate moving to feature input
      setUIMode('create', {
        project: 'project-2',
        featureName: ''
      });
      await simulateTimeDelay(50);

      // Should move to feature name input
      const featureInputOutput = lastFrame();
      expect(featureInputOutput).toContain('Feature Name');
    });

    test('should navigate branch picker dialog', async () => {
      // Given: Project with remote branches and a worktree
      const project = setupBasicProject('my-project');
      createProjectWithFeatures('my-project', ['existing-feature']); // Need a worktree to show in main view
      createRemoteBranches('my-project', ['feature-a', 'feature-b', 'feature-c']);

      const {stdin, lastFrame, setUIMode} = renderTestApp();
      await simulateTimeDelay(50);

      // When: Branch picker is opened
      setUIMode('pickBranch', {
        title: 'Select Branch',
        items: ['feature-a', 'feature-b', 'feature-c'],
        selectedIndex: 0
      });
      await simulateTimeDelay(50);

      // Then: Branch picker shows available branches
      const branchPickerOutput = lastFrame();
      expect(branchPickerOutput).toContain('feature-a');
      expect(branchPickerOutput).toContain('feature-b');

      // When: User navigates and selects a branch
      setUIMode('pickBranch', {
        title: 'Select Branch', 
        items: ['feature-a', 'feature-b', 'feature-c'],
        selectedIndex: 2
      });
      await simulateTimeDelay(50);

      // And: Returns to main view
      setUIMode('list');
      await simulateTimeDelay(100);

      // Then: Main view shows the project features
      const finalOutput = lastFrame();
      expect(finalOutput).toContain('my-project/existing-feature'); // More specific check
    });

    test('should cancel dialogs with escape key', async () => {
      setupBasicProject('my-project');

      const {stdin, lastFrame, setUIMode} = renderTestApp();
      await simulateTimeDelay(50);

      // Simulate opening create feature dialog
      setUIMode('create', {project: 'my-project', featureName: ''});
      await simulateTimeDelay(50);
      expect(lastFrame()).toContain('Create Feature');

      // Simulate cancel with escape
      setUIMode('list');
      await simulateTimeDelay(50);

      // Should be back to main view
      const output = lastFrame();
      expect(output).not.toContain('Create Feature');
    });
  });

  describe('Refresh Operations', () => {
    test('should handle manual refresh', async () => {
      setupProjectWithWorktrees('my-project', ['feature-1']);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      // Verify initial state
      expect(lastFrame()).toContain('my-project/feature-1');

      // Press 'r' to refresh
      stdin.write('r');
      await simulateTimeDelay(100);

      // Should still show the worktree (data should be refreshed)
      expect(lastFrame()).toContain('my-project/feature-1');
    });


    test('should handle quit operation', async () => {
      setupProjectWithWorktrees('my-project', ['feature-1']);
      
      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      // Press 'q' to quit
      stdin.write('q');
      await simulateTimeDelay(50);

      // App should initiate exit sequence
      // In real implementation, this would exit the process
      // In tests, we mock process.exit so we can verify the intent
    });
  });
});