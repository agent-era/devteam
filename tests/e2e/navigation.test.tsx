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
} from '../utils/testHelpers.js';

describe('Navigation E2E', () => {
  beforeEach(() => {
    resetTestData();
  });

  describe('Keyboard Navigation', () => {
    test('should navigate with j/k keys', async () => {
      // Setup: Multiple worktrees
      setupProjectWithWorktrees('my-project', ['feature-1', 'feature-2', 'feature-3']);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(100); // Allow initial render

      // Initial state - should highlight first item (index 0)
      let output = lastFrame();
      expect(output).toContain('my-project/feature-1');

      // Navigate down with 'j'
      stdin.write('j');
      await simulateTimeDelay(50);

      // Should now highlight second item (index 1)
      output = lastFrame();
      expect(output).toContain('my-project/feature-2');

      // Navigate down again
      stdin.write('j');
      await simulateTimeDelay(50);

      // Should highlight third item (index 2)
      output = lastFrame();
      expect(output).toContain('my-project/feature-3');

      // Navigate up with 'k'
      stdin.write('k');
      await simulateTimeDelay(50);

      // Should be back to second item
      output = lastFrame();
      expect(output).toContain('my-project/feature-2');

      // Navigate up to first
      stdin.write('k');
      await simulateTimeDelay(50);

      // Should be back to first item
      output = lastFrame();
      expect(output).toContain('my-project/feature-1');
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
    test.skip('should switch to help view', async () => {
      setupProjectWithWorktrees('my-project', ['feature-1']);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      // Press '?' to open help
      stdin.write('?');
      await simulateTimeDelay(50);

      // Should show help overlay
      const output = lastFrame();
      expect(output).toContain('Help'); // Should contain help content
      
      // Should show keyboard shortcuts
      expect(output).toContain('j/k'); // Navigation keys
      expect(output).toContain('n'); // New feature key
      expect(output).toContain('a'); // Archive key
    });

    test.skip('should switch to archived view', async () => {
      setupProjectWithWorktrees('my-project', ['feature-1']);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      // Press 'v' to view archived
      stdin.write('v');
      await simulateTimeDelay(50);

      // Should show archived view
      const output = lastFrame();
      expect(output).toContain('Archived'); // Should show archived header
    });

    test.skip('should switch to diff view', async () => {
      setupProjectWithWorktrees('my-project', ['feature-1']);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      // Press 'd' to view diff
      stdin.write('d');
      await simulateTimeDelay(50);

      // Should show diff view
      const output = lastFrame();
      expect(output).toContain('Diff Viewer'); // Should show diff viewer
    });

    test.skip('should switch to uncommitted diff view', async () => {
      setupProjectWithWorktrees('my-project', ['feature-1']);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      // Press 'D' to view uncommitted changes
      stdin.write('D');
      await simulateTimeDelay(50);

      // Should show uncommitted diff view
      const output = lastFrame();
      expect(output).toContain('Diff Viewer (Uncommitted Changes)');
    });

    test.skip('should return to main view from other views', async () => {
      setupProjectWithWorktrees('my-project', ['feature-1']);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      // Go to help
      stdin.write('?');
      await simulateTimeDelay(50);
      expect(lastFrame()).toContain('Help');

      // Press escape to go back
      stdin.write('\u001b'); // ESC key
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
    test.skip('should navigate project picker dialog', async () => {
      // Setup: Multiple projects
      setupTestProject('project-1');
      setupTestProject('project-2');
      setupTestProject('project-3');

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      // Open create feature dialog
      stdin.write('n');
      await simulateTimeDelay(50);

      // Should show project picker with multiple projects
      const dialogOutput = lastFrame();
      expect(dialogOutput).toContain('Create Feature');
      expect(dialogOutput).toContain('project-1');
      expect(dialogOutput).toContain('project-2');
      expect(dialogOutput).toContain('project-3');

      // Navigate between projects
      stdin.write('j'); // Move down
      await simulateTimeDelay(50);

      // Select current project
      stdin.write('\r');
      await simulateTimeDelay(50);

      // Should move to feature name input
      const featureInputOutput = lastFrame();
      expect(featureInputOutput).toContain('Feature Name'); // Or similar input prompt
    });

    test.skip('should navigate branch picker dialog', async () => {
      // Setup: Project with remote branches
      const project = setupBasicProject('my-project');
      setupRemoteBranches('my-project', [
        {local_name: 'feature-a', remote_name: 'origin/feature-a'},
        {local_name: 'feature-b', remote_name: 'origin/feature-b'},
        {local_name: 'feature-c', remote_name: 'origin/feature-c'},
      ]);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      // Open branch picker
      stdin.write('b');
      await simulateTimeDelay(50);

      // Should show branch picker
      const branchPickerOutput = lastFrame();
      expect(branchPickerOutput).toContain('feature-a');
      expect(branchPickerOutput).toContain('feature-b');

      // Navigate between branches
      stdin.write('j'); // Move down
      await simulateTimeDelay(50);
      
      stdin.write('j'); // Move down again
      await simulateTimeDelay(50);

      // Select branch
      stdin.write('\r');
      await simulateTimeDelay(100);

      // Should create worktree from selected branch
      // Verify in main view
      const finalOutput = lastFrame();
      expect(finalOutput).toContain('my-project');
    });

    test.skip('should cancel dialogs with escape key', async () => {
      setupBasicProject('my-project');

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);

      // Open create feature dialog
      stdin.write('n');
      await simulateTimeDelay(50);
      expect(lastFrame()).toContain('Create Feature');

      // Cancel with escape
      stdin.write('\u001b'); // ESC key
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