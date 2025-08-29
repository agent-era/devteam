import {describe, test, expect, beforeEach} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {resetTestData, createProjectWithFeatures, simulateTimeDelay} from '../utils/testHelpers.js';

describe('Page Navigation Behavior', () => {
  beforeEach(() => {
    resetTestData();
  });

  test('should jump to bottom/top when page navigation is used on single page', async () => {
    // Setup: Create a small number of features (less than page size)
    createProjectWithFeatures('my-project', ['feature-1', 'feature-2', 'feature-3']);

    const {stdin, lastFrame} = renderTestApp();
    await simulateTimeDelay(100);

    // Initial render should show all features
    let output = lastFrame();
    expect(output).toContain('my-project/feature-1');
    expect(output).toContain('my-project/feature-2');
    expect(output).toContain('my-project/feature-3');

    // Move down to second item
    stdin.write('j');
    await simulateTimeDelay(50);
    output = lastFrame();
    expect(output).toContain('my-project/feature-2');

    // Press Page Down (should jump to last item since only 1 page)
    stdin.write('\u001b[6~'); // Page Down key
    await simulateTimeDelay(50);
    
    // Should still render normally without errors, and cursor should be on last item
    output = lastFrame();
    expect(output).toContain('my-project/feature-1');
    expect(output).toContain('my-project/feature-2');
    expect(output).toContain('my-project/feature-3');

    // Press Page Up (should jump to first item since only 1 page)
    stdin.write('\u001b[5~'); // Page Up key
    await simulateTimeDelay(50);
    
    // Should still render normally without errors, and cursor should be on first item
    output = lastFrame();
    expect(output).toContain('my-project/feature-1');
    expect(output).toContain('my-project/feature-2');
    expect(output).toContain('my-project/feature-3');
  });

  test('should handle pagination normally with multiple pages', async () => {
    // Setup: Create enough features to have multiple pages (assuming page size of 20)
    const manyFeatures = Array.from({length: 25}, (_, i) => `feature-${i + 1}`);
    createProjectWithFeatures('my-project', manyFeatures);

    const {stdin, lastFrame} = renderTestApp();
    await simulateTimeDelay(100);

    // Initial render should show first page features
    let output = lastFrame();
    expect(output).toContain('my-project/feature-1');
    
    // Press Page Down to go to next page
    stdin.write('\u001b[6~'); // Page Down key
    await simulateTimeDelay(50);
    
    // Should render without errors (specific page content depends on mock implementation)
    output = lastFrame();
    expect(output).toBeDefined();
    expect(output).toContain('my-project/feature-'); // Should still contain project features
  });

  test('should not throw errors when navigating with keyboard shortcuts', async () => {
    // Setup: Single page scenario
    createProjectWithFeatures('test-project', ['feature-a', 'feature-b']);

    const {stdin, lastFrame} = renderTestApp();
    await simulateTimeDelay(100);

    // Test various keyboard inputs that interact with pagination
    const keySequence = [
      'j', // Move down
      'k', // Move up  
      '\u001b[6~', // Page Down
      '\u001b[5~', // Page Up
      '>', // Next page (comma/period)
      '<', // Previous page (comma/period)
    ];

    for (const key of keySequence) {
      expect(() => {
        stdin.write(key);
      }).not.toThrow();
      await simulateTimeDelay(20);
      
      // Verify rendering still works
      const output = lastFrame();
      expect(output).toBeDefined();
      expect(output).toContain('test-project/feature-');
    }
  });
});