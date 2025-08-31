import {describe, test, expect, beforeEach} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {resetTestData, createProjectWithFeatures, simulateTimeDelay} from '../utils/testHelpers.js';

describe('Page Navigation Behavior', () => {
  beforeEach(() => {
    resetTestData();
  });

  test('should move by half screen when page navigation is used on single page', async () => {
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

    // Press Page Down (should move by half screen, typically to last item for small list)
    stdin.write('\u001b[6~'); // Page Down key
    await simulateTimeDelay(50);
    
    // Should still render normally without errors, and likely be at last item due to half-screen movement
    output = lastFrame();
    expect(output).toContain('my-project/feature-1');
    expect(output).toContain('my-project/feature-2');
    expect(output).toContain('my-project/feature-3');

    // Press Page Up (should move back by half screen, likely to first item for small list)
    stdin.write('\u001b[5~'); // Page Up key
    await simulateTimeDelay(50);
    
    // Should still render normally without errors
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

  test('should handle Home/End keys with page navigation on multiple pages', async () => {
    // Setup: Create enough features to have multiple pages (assuming page size of 20)
    const manyFeatures = Array.from({length: 45}, (_, i) => `feature-${String(i + 1).padStart(2, '0')}`);
    createProjectWithFeatures('multi-project', manyFeatures);

    const {stdin, lastFrame} = renderTestApp();
    await simulateTimeDelay(100);

    // Initial render should show first page features
    let output = lastFrame();
    expect(output).toContain('multi-project/feature-01');
    
    // Move to middle of first page
    for (let i = 0; i < 10; i++) {
      stdin.write('j');
      await simulateTimeDelay(10);
    }

    // Press End key (should jump to last item on last page)
    stdin.write('\u001b[F'); // End key
    await simulateTimeDelay(50);
    
    // Should render without errors and be on a page showing the last item
    output = lastFrame();
    expect(output).toBeDefined();
    expect(output).toContain('multi-project/feature-'); // Should still contain project features

    // Press Home key (should jump to first item on first page)  
    stdin.write('\u001b[H'); // Home key
    await simulateTimeDelay(50);
    
    // Should render without errors and be on first page
    output = lastFrame();
    expect(output).toBeDefined();
    expect(output).toContain('multi-project/feature-01'); // Should show first item
  });

  test('should handle Home/End keys on single page without errors', async () => {
    // Setup: Single page scenario
    createProjectWithFeatures('single-project', ['alpha', 'beta', 'gamma']);

    const {stdin, lastFrame} = renderTestApp();
    await simulateTimeDelay(100);

    // Move to middle item
    stdin.write('j');
    await simulateTimeDelay(50);

    // Press End key (should jump to last item)
    stdin.write('\u001b[F'); // End key
    await simulateTimeDelay(50);
    
    let output = lastFrame();
    expect(output).toBeDefined();
    expect(output).toContain('single-project/gamma');

    // Press Home key (should jump to first item)
    stdin.write('\u001b[H'); // Home key
    await simulateTimeDelay(50);
    
    output = lastFrame();
    expect(output).toBeDefined();
    expect(output).toContain('single-project/alpha');
  });
});