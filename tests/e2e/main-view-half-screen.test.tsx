import {describe, test, expect, beforeEach} from '@jest/globals';
import {renderTestApp, delay} from '../utils/renderApp.js';
import {
  createProjectWithFeatures,
  resetTestData
} from '../utils/testHelpers.js';

const simulateTimeDelay = delay;

describe('Main view half-screen navigation', () => {
  beforeEach(() => {
    resetTestData();
  });

  describe('Single page half-screen navigation', () => {
    test('should move by half screen with 10 items (typical half page)', async () => {
      // Create 10 items, which is typically half a page size (~19)
      const features = Array.from({length: 10}, (_, i) => `item-${String(i + 1).padStart(2, '0')}`);
      createProjectWithFeatures('half-page-project', features);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Start at first item
      let output = lastFrame();
      expect(output).toContain('half-page-project/item-01');

      // Move to 5th item to establish position
      for (let i = 0; i < 4; i++) {
        stdin.write('j');
        await simulateTimeDelay(10);
      }
      
      output = lastFrame();
      expect(output).toContain('half-page-project/item-05');

      // Page Down - should move by about half of available screen (~4-5 items from pageSize ~9-10)
      stdin.write('\u001b[6~'); // Page Down key
      await simulateTimeDelay(50);
      
      output = lastFrame();
      // Should move forward significantly but not to the end
      expect(output).toContain('half-page-project/item-09'); // Should move to around item 9 or 10
      expect(output).not.toContain('total: 999'); // Shouldn't crash or show errors

      // Page Up - should move back by half screen
      stdin.write('\u001b[5~'); // Page Up key  
      await simulateTimeDelay(50);
      
      output = lastFrame();
      // Should move back to around item 5
      expect(output).toContain('half-page-project/item-05');
    });

    test('should move by half screen with 15 items (more than half but less than full page)', async () => {
      const features = Array.from({length: 15}, (_, i) => `feature-${String(i + 1).padStart(2, '0')}`);
      createProjectWithFeatures('medium-project', features);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Move to middle item (8th item)
      for (let i = 0; i < 7; i++) {
        stdin.write('j');
        await simulateTimeDelay(10);
      }
      
      let output = lastFrame();
      expect(output).toContain('medium-project/feature-08');

      // Page Down - should move forward by half screen
      stdin.write('\u001b[6~');
      await simulateTimeDelay(50);
      
      output = lastFrame();
      // Should move to around item 12-13 (8 + ~4-5 items)
      expect(output).toContain('medium-project/feature-12');

      // Page Up - should move back
      stdin.write('\u001b[5~');
      await simulateTimeDelay(50);
      
      output = lastFrame();
      // Should move back to around item 8
      expect(output).toContain('medium-project/feature-08');
    });

    test('should not exceed boundaries on single page', async () => {
      const features = Array.from({length: 8}, (_, i) => `boundary-${i + 1}`);
      createProjectWithFeatures('boundary-project', features);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Start at first item and try Page Up - should stay at first
      stdin.write('\u001b[5~'); // Page Up
      await simulateTimeDelay(50);
      
      let output = lastFrame();
      expect(output).toContain('boundary-project/boundary-1'); // Should stay at first

      // Move to last item
      for (let i = 0; i < 7; i++) {
        stdin.write('j');
        await simulateTimeDelay(10);
      }
      
      output = lastFrame();
      expect(output).toContain('boundary-project/boundary-8');

      // Page Down from last item - should stay at last
      stdin.write('\u001b[6~'); // Page Down
      await simulateTimeDelay(50);
      
      output = lastFrame();
      expect(output).toContain('boundary-project/boundary-8'); // Should stay at last
    });

    test('should handle half-screen navigation near boundaries smoothly', async () => {
      const features = Array.from({length: 12}, (_, i) => `smooth-${String(i + 1).padStart(2, '0')}`);
      createProjectWithFeatures('smooth-project', features);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Move to near end (item 10)
      for (let i = 0; i < 9; i++) {
        stdin.write('j');
        await simulateTimeDelay(10);
      }
      
      let output = lastFrame();
      expect(output).toContain('smooth-project/smooth-10');

      // Page Down - should move to end but not crash
      stdin.write('\u001b[6~');
      await simulateTimeDelay(50);
      
      output = lastFrame();
      expect(output).toContain('smooth-project/smooth-12'); // Should move to last item

      // Page Down again - should stay at last item
      stdin.write('\u001b[6~');
      await simulateTimeDelay(50);
      
      output = lastFrame();
      expect(output).toContain('smooth-project/smooth-12'); // Should stay at last
    });
  });

  describe('Multi-page half-screen navigation (regression test)', () => {
    test('should maintain half-screen navigation with multiple pages', async () => {
      // Create enough items for multiple pages (30 items)
      const features = Array.from({length: 30}, (_, i) => `multi-${String(i + 1).padStart(2, '0')}`);
      createProjectWithFeatures('multi-project', features);

      const {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Move to middle of first page (item 10)
      for (let i = 0; i < 9; i++) {
        stdin.write('j');
        await simulateTimeDelay(10);
      }
      
      let output = lastFrame();
      expect(output).toContain('multi-project/multi-10');

      // Page Down - should move by half screen within or to next page
      stdin.write('\u001b[6~');
      await simulateTimeDelay(50);
      
      output = lastFrame();
      // Should have moved significantly forward (item 10 may still be visible but selection moved)
      // With pageSize ~19, half is ~9, so from item 10 should go to item 19
      expect(output).toContain('multi-project/multi-19'); // Should have moved to around item 19

      // Page Up - should move back by half screen
      stdin.write('\u001b[5~');
      await simulateTimeDelay(50);
      
      output = lastFrame();
      // Should be back around item 10
      expect(output).toContain('multi-project/multi-10');
    });
  });

  describe('Consistent behavior across different list sizes', () => {
    test('should behave consistently with 3 items vs 30 items', async () => {
      // Test with 3 items (definitely single page)
      createProjectWithFeatures('tiny-list', ['a', 'b', 'c']);

      let {stdin, lastFrame} = renderTestApp();
      await simulateTimeDelay(100);

      // Move to middle item
      stdin.write('j');
      await simulateTimeDelay(10);
      
      let output = lastFrame();
      expect(output).toContain('tiny-list/b');

      // Page Down - should move by half screen (not jump to end)
      stdin.write('\u001b[6~');
      await simulateTimeDelay(50);
      
      output = lastFrame();
      expect(output).toContain('tiny-list/c'); // Should move to last item naturally

      // Reset for large list test
      resetTestData();
      
      // Test with 30 items (multiple pages)
      const largeFeatures = Array.from({length: 30}, (_, i) => `large-${String(i + 1).padStart(2, '0')}`);
      createProjectWithFeatures('large-list', largeFeatures);

      const testApp2 = renderTestApp();
      stdin = testApp2.stdin;
      lastFrame = testApp2.lastFrame;
      await simulateTimeDelay(100);

      // Move to second item
      stdin.write('j');
      await simulateTimeDelay(10);
      
      output = lastFrame();
      expect(output).toContain('large-list/large-02');

      // Page Down - should also move by half screen (consistent behavior)
      stdin.write('\u001b[6~');
      await simulateTimeDelay(50);
      
      output = lastFrame();
      // Should have moved forward by half screen, not jumped to end
      // From item 2, half screen (~9) should go to around item 11
      expect(output).not.toContain('large-list/large-30'); // Should not jump to end
      expect(output).toContain('large-list/large-11'); // Should have moved to around item 11
    });
  });
});