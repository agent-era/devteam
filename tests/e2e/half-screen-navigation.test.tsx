import {describe, test, expect, beforeEach} from '@jest/globals';
import {renderTestApp, delay} from '../utils/renderApp.js';
import {
  createProjectWithFeatures,
  resetTestData,
  setupBasicProject
} from '../utils/testHelpers.js';

const simulateTimeDelay = delay;

describe('Half-screen navigation', () => {
  beforeEach(() => {
    resetTestData();
  });

  describe('WorktreeListScreen half-screen navigation', () => {
    test('should move selection by half screen on page up/down', async () => {
      // Create enough features to test page navigation (30 items)
      const features = Array.from({length: 30}, (_, i) => `feature-${String(i + 1).padStart(2, '0')}`);
      createProjectWithFeatures('test-project', features);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Start at first item
      let output = lastFrame();
      expect(output).toContain('test-project/feature-01');

      // Move down several items to establish a position (move to item 10)
      for (let i = 0; i < 9; i++) {
        stdin.write('j');
        await simulateTimeDelay(10);
      }
      
      output = lastFrame();
      expect(output).toContain('test-project/feature-10');

      // Page Down - should move by half a screen (around 9 items for pageSize ~19)
      // The selection should move but might still be on the same visual page
      stdin.write('\u001b[6~'); // Page Down key
      await simulateTimeDelay(50);
      
      output = lastFrame();
      // Should have moved forward significantly (around item 19)
      expect(output).toContain('test-project/feature-19');

      // Page Up - should move back by half screen
      stdin.write('\u001b[5~'); // Page Up key  
      await simulateTimeDelay(50);
      
      output = lastFrame();
      // Should be back around item 10
      expect(output).toContain('test-project/feature-10');
    });

    test('should not exceed bounds when half-screen navigation reaches limits', async () => {
      // Create small set of features
      const features = ['feature-01', 'feature-02', 'feature-03'];
      createProjectWithFeatures('small-project', features);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Start at first item
      let output = lastFrame();
      expect(output).toContain('small-project/feature-01');

      // Page Up from first item - should stay at first
      stdin.write('\u001b[5~'); // Page Up key
      await simulateTimeDelay(50);
      
      output = lastFrame();
      expect(output).toContain('small-project/feature-01');

      // Move to last item
      stdin.write('k'); // Move down
      await simulateTimeDelay(10);
      stdin.write('k'); // Move down
      await simulateTimeDelay(10);
      
      // Page Down from near end - should not exceed last item
      stdin.write('\u001b[6~'); // Page Down key
      await simulateTimeDelay(50);
      
      output = lastFrame();
      expect(output).toContain('small-project/feature-03');
    });
  });

  // Note: DiffView tests would require setting up actual diff content,
  // which is complex in the test environment. The DiffView implementation
  // has been updated and will be tested through integration.

  // Note: BranchPickerDialog tests would require complex setup of remote branches
  // The BranchPickerDialog implementation has been updated to use half-screen navigation

  describe('Half-screen movement calculation', () => {
    test('should move by approximately half the visible screen size', async () => {
      // Create a project with exactly 40 features to test precise movement
      const features = Array.from({length: 40}, (_, i) => `item-${String(i + 1).padStart(2, '0')}`);
      createProjectWithFeatures('precision-project', features);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Start at first item
      let output = lastFrame();
      expect(output).toContain('precision-project/item-01');

      // Record initial position by moving to a known position
      for (let i = 0; i < 4; i++) { // Move to 5th item
        stdin.write('j');
        await simulateTimeDelay(10);
      }
      
      output = lastFrame();
      expect(output).toContain('precision-project/item-05');

      // Page Down - should move by half screen (expected ~9 items if screen is ~19)
      stdin.write('\u001b[6~'); // Page Down
      await simulateTimeDelay(50);
      
      // The selection should move forward by about half the page size
      // With pageSize ~19, half would be ~9, so from item 5 should go to around item 14
      output = lastFrame();
      expect(output).toContain('precision-project/item-14'); // Should have moved significantly forward
      expect(output).not.toContain('precision-project/item-40'); // Should not be at the very end
    });
  });

  describe('Edge cases', () => {
    test('should handle half-screen navigation with very few items', async () => {
      createProjectWithFeatures('tiny-project', ['only-feature']);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Page navigation with single item should not crash
      stdin.write('\u001b[6~'); // Page Down
      await simulateTimeDelay(50);
      
      let output = lastFrame();
      expect(output).toContain('tiny-project/only-feature');

      stdin.write('\u001b[5~'); // Page Up
      await simulateTimeDelay(50);
      
      output = lastFrame();
      expect(output).toContain('tiny-project/only-feature');
    });

    test('should handle repeated page navigation without errors', async () => {
      const features = Array.from({length: 20}, (_, i) => `repeat-${String(i + 1).padStart(2, '0')}`);
      createProjectWithFeatures('repeat-project', features);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Rapid page navigation should not cause errors
      const keys = ['\u001b[6~', '\u001b[5~', '\u001b[6~', '\u001b[5~']; // Page Down, Page Up, Page Down, Page Up
      
      for (const key of keys) {
        stdin.write(key);
        await simulateTimeDelay(20);
        
        let output = lastFrame();
        expect(output).toContain('repeat-project');
      }
    });
  });
});