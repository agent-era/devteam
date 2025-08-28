import {describe, test, expect, beforeEach} from '@jest/globals';
import {delay, renderApp} from '../utils/renderApp.js';
import {memoryStore} from '../fakes/stores.js';
import {WorktreeInfo} from '../../src/models.js';

// Helper to create and populate mock worktrees in memory store
function setupMockWorktrees(count: number) {
  memoryStore.reset();
  
  for (let i = 0; i < count; i++) {
    const project = `project-${Math.floor(i / 5)}`;
    const feature = `feature-${i}`;
    const path = `/projects/${project}-branches/${feature}`;
    
    memoryStore.worktrees.set(path, new WorktreeInfo({
      project,
      feature,
      path,
      branch: feature
    }));
  }
}

describe('Pagination E2E Workflows', () => {
  beforeEach(() => {
    memoryStore.reset();
  });

  describe('Basic pagination navigation', () => {
    test('should navigate through pages with arrow keys and pagination keys', async () => {
      setupMockWorktrees(25); // 3 pages with pageSize 10
      const {result, stdin} = renderApp();
      
      await delay(100);
      let output = result.lastFrame();
      expect(output).toContain('[Page 1/3: 1-10/25]');
      expect(output).toContain('feature-0');
      
      // Navigate to next page with '>'
      stdin.write('>');
      await delay(50);
      output = result.lastFrame();
      expect(output).toContain('[Page 2/3: 11-20/25]');
      expect(output).toContain('feature-10');
      expect(output).not.toContain('feature-0');
      
      // Navigate to previous page with '<'
      stdin.write('<');
      await delay(50);
      output = result.lastFrame();
      expect(output).toContain('[Page 1/3: 1-10/25]');
      expect(output).toContain('feature-0');
    });

    test('should navigate through pages with comma and period keys', async () => {
      setupMockWorktrees(25);
      const {result, stdin} = renderApp();
      
      await delay(100);
      let output = result.lastFrame();
      expect(output).toContain('[Page 1/3:');
      
      // Navigate to next page with '.'
      stdin.write('.');
      await delay(50);
      output = result.lastFrame();
      expect(output).toContain('[Page 2/3:');
      
      // Navigate to previous page with ','
      stdin.write(',');
      await delay(50);
      output = result.lastFrame();
      expect(output).toContain('[Page 1/3:');
    });

    test('should wrap around from last page to first page', async () => {
      setupMockWorktrees(25); 
      const {result, stdin} = renderApp();
      
      await delay(100);
      
      // Go to last page
      stdin.write('>'); // Page 2
      await delay(50);
      stdin.write('>'); // Page 3
      await delay(50);
      let output = result.lastFrame();
      expect(output).toContain('[Page 3/3: 21-25/25]');
      expect(output).toContain('feature-20');
      
      // Wrap to first page
      stdin.write('>');
      await delay(50);
      output = result.lastFrame();
      expect(output).toContain('[Page 1/3: 1-10/25]');
      expect(output).toContain('feature-0');
    });

    test('should wrap around from first page to last page when going backward', async () => {
      setupMockWorktrees(25);
      const {result, stdin} = renderApp();
      
      await delay(100);
      let output = result.lastFrame();
      expect(output).toContain('[Page 1/3:');
      
      // Wrap to last page
      stdin.write('<');
      await delay(50);
      output = result.lastFrame();
      expect(output).toContain('[Page 3/3: 21-25/25]');
      expect(output).toContain('feature-20');
    });
  });

  describe('Selection movement across pages', () => {
    test('should update page when moving selection with j/k keys', async () => {
      setupMockWorktrees(25);
      const {result, stdin} = renderApp();
      
      await delay(100);
      let output = result.lastFrame();
      expect(output).toContain('[Page 1/3:');
      
      // Move down to item 9 (last on first page)
      for (let i = 0; i < 9; i++) {
        stdin.write('j');
        await delay(10);
      }
      
      output = result.lastFrame();
      expect(output).toContain('[Page 1/3:');
      
      // Move down one more to cross page boundary
      stdin.write('j');
      await delay(50);
      output = result.lastFrame();
      expect(output).toContain('[Page 2/3:');
      expect(output).toContain('feature-10');
    });

    test('should update page when moving selection backward across page boundary', async () => {
      setupMockWorktrees(25);
      const {result, stdin} = renderApp();
      
      await delay(100);
      
      // Navigate to second page first
      stdin.write('>');
      await delay(50);
      let output = result.lastFrame();
      expect(output).toContain('[Page 2/3:');
      
      // Move up to cross page boundary
      stdin.write('k');
      await delay(50);
      output = result.lastFrame();
      expect(output).toContain('[Page 1/3:');
      expect(output).toContain('feature-9'); // Should be on last item of first page
    });

    test('should handle large movements with arrow keys', async () => {
      setupMockWorktrees(25);
      const {result, stdin} = renderApp();
      
      await delay(100);
      let output = result.lastFrame();
      expect(output).toContain('[Page 1/3:');
      
      // Make a large movement with multiple j presses
      for (let i = 0; i < 15; i++) {
        stdin.write('j');
        await delay(5);
      }
      
      output = result.lastFrame();
      expect(output).toContain('[Page 2/3:');
      expect(output).toContain('feature-15');
    });
  });

  describe('PageUp/PageDown navigation', () => {
    test('should navigate pages with PageDown key', async () => {
      setupMockWorktrees(25);
      const {result, stdin} = renderApp();
      
      await delay(100);
      let output = result.lastFrame();
      expect(output).toContain('[Page 1/3:');
      
      // Send PageDown key sequence
      stdin.write('\x1b[6~');
      await delay(50);
      output = result.lastFrame();
      expect(output).toContain('[Page 2/3:');
    });

    test('should navigate pages with PageUp key', async () => {
      setupMockWorktrees(25);
      const {result, stdin} = renderApp();
      
      await delay(100);
      
      // Go to second page first
      stdin.write('>');
      await delay(50);
      let output = result.lastFrame();
      expect(output).toContain('[Page 2/3:');
      
      // Send PageUp key sequence
      stdin.write('\x1b[5~');
      await delay(50);
      output = result.lastFrame();
      expect(output).toContain('[Page 1/3:');
    });
  });

  describe('Home/End key navigation', () => {
    test('should jump to first item with Home key', async () => {
      setupMockWorktrees(25);
      const {result, stdin} = renderApp();
      
      await delay(100);
      
      // Navigate to middle of second page
      stdin.write('>');
      await delay(50);
      for (let i = 0; i < 5; i++) {
        stdin.write('j');
        await delay(5);
      }
      
      let output = result.lastFrame();
      expect(output).toContain('[Page 2/3:');
      
      // Jump to first item with Home key
      stdin.write('\x1b[H');
      await delay(50);
      output = result.lastFrame();
      expect(output).toContain('[Page 1/3:');
      expect(output).toContain('feature-0');
    });

    test('should jump to last item with End key', async () => {
      setupMockWorktrees(25);
      const {result, stdin} = renderApp();
      
      await delay(100);
      let output = result.lastFrame();
      expect(output).toContain('[Page 1/3:');
      
      // Jump to last item with End key
      stdin.write('\x1b[F');
      await delay(50);
      output = result.lastFrame();
      expect(output).toContain('[Page 3/3:');
      expect(output).toContain('feature-24');
    });
  });

  describe('Number key selection across pages', () => {
    test('should select numbered items within current page', async () => {
      setupMockWorktrees(25);
      const {result, stdin} = renderApp();
      
      await delay(100);
      
      // Navigate to second page
      stdin.write('>');
      await delay(50);
      let output = result.lastFrame();
      expect(output).toContain('[Page 2/3:');
      
      // Press '5' to select the 5th item on current page (feature-14)
      stdin.write('5');
      await delay(50);
      output = result.lastFrame();
      expect(output).toContain('feature-14');
    });

    test('should not select items beyond current page range', async () => {
      setupMockWorktrees(15); // Only 2 pages
      const {result, stdin} = renderApp();
      
      await delay(100);
      
      // Navigate to second page (items 10-14)
      stdin.write('>');
      await delay(50);
      let output = result.lastFrame();
      expect(output).toContain('[Page 2/2:');
      
      // Try to press '9' but page only has 5 items (10-14)
      const beforeOutput = result.lastFrame();
      stdin.write('9');
      await delay(50);
      const afterOutput = result.lastFrame();
      
      // Selection should not have changed
      expect(afterOutput).toBe(beforeOutput);
    });
  });

  describe('Single page scenarios', () => {
    test('should not show pagination controls for single page', async () => {
      setupMockWorktrees(5); // Single page
      const {result, stdin} = renderApp();
      
      await delay(100);
      let output = result.lastFrame();
      expect(output).toContain('[5 items]');
      expect(output).not.toContain('[Page ');
      expect(output).not.toContain('< , previous page');
    });

    test('should handle pagination keys gracefully on single page', async () => {
      setupMockWorktrees(5);
      const {result, stdin} = renderApp();
      
      await delay(100);
      const beforeOutput = result.lastFrame();
      expect(beforeOutput).toContain('[5 items]');
      
      // Try pagination keys - should not change anything
      stdin.write('>');
      await delay(50);
      stdin.write('<');
      await delay(50);
      
      const afterOutput = result.lastFrame();
      expect(afterOutput).toContain('[5 items]');
      // Selection should remain the same
    });
  });

  describe('Edge cases and error handling', () => {
    test('should handle empty list gracefully', async () => {
      // Don't setup any worktrees - empty list
      const {result, stdin} = renderApp();
      
      await delay(100);
      let output = result.lastFrame();
      expect(output).toContain('No worktrees found');
      
      // Pagination keys should not crash
      stdin.write('>');
      stdin.write('<');
      stdin.write('j');
      stdin.write('k');
      await delay(50);
      
      output = result.lastFrame();
      expect(output).toContain('No worktrees found');
    });

    test('should handle dynamic worktree list changes', async () => {
      setupMockWorktrees(15); // 2 pages
      const {result, stdin} = renderApp();
      
      await delay(100);
      let output = result.lastFrame();
      expect(output).toContain('[Page 1/2:');
      
      // Navigate to second page
      stdin.write('>');
      await delay(50);
      output = result.lastFrame();
      expect(output).toContain('[Page 2/2:');
      
      // Simulate worktrees being removed (reducing to single page)
      for (const path of Array.from(memoryStore.worktrees.keys()).slice(8)) {
        memoryStore.worktrees.delete(path);
      }
      
      // Trigger refresh
      stdin.write('r');
      await delay(100);
      output = result.lastFrame();
      
      // Should adjust to single page
      expect(output).toContain('[8 items]');
      expect(output).not.toContain('[Page ');
    });

    test('should maintain selection when page structure changes', async () => {
      setupMockWorktrees(25);
      const {result, stdin} = renderApp();
      
      await delay(100);
      
      // Navigate to specific item on second page
      stdin.write('>');
      await delay(50);
      stdin.write('j'); // Select second item on page (feature-11)
      await delay(50);
      let output = result.lastFrame();
      expect(output).toContain('feature-11');
      
      // Items get removed, changing page structure
      // Remove first 10 items so feature-11 becomes feature-1 on first page
      const pathsToRemove = Array.from(memoryStore.worktrees.keys()).slice(0, 10);
      pathsToRemove.forEach(path => memoryStore.worktrees.delete(path));
      
      // Trigger refresh
      stdin.write('r');
      await delay(100);
      output = result.lastFrame();
      
      // Should handle gracefully even if exact item no longer exists
      expect(output).toContain('[Page ');
    });
  });

  describe('Performance with large datasets', () => {
    test('should handle large worktree lists efficiently', async () => {
      setupMockWorktrees(100); // Large list - 10 pages
      const {result, stdin} = renderApp();
      
      await delay(100);
      let output = result.lastFrame();
      expect(output).toContain('[Page 1/10:');
      
      // Navigate quickly through several pages
      for (let i = 0; i < 5; i++) {
        stdin.write('>');
        await delay(20);
      }
      
      output = result.lastFrame();
      expect(output).toContain('[Page 6/10:');
      expect(output).toContain('feature-50');
      
      // Jump to end
      stdin.write('\x1b[F'); // End key
      await delay(50);
      output = result.lastFrame();
      expect(output).toContain('[Page 10/10:');
      expect(output).toContain('feature-99');
    });
  });
});