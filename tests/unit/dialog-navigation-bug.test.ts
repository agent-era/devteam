import {describe, test, expect, beforeEach} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {resetTestData, createProjectWithFeatures, simulateTimeDelay} from '../utils/testHelpers.js';

describe('Dialog Navigation Bug Fix Verification', () => {
  beforeEach(() => {
    resetTestData();
  });

  test('should properly return to main view when canceling archive dialog', async () => {
    // Setup: Create a project with features to enable archive functionality
    createProjectWithFeatures('test-project', ['feature-1', 'feature-2']);

    const {lastFrame, setUIMode} = renderTestApp();
    await simulateTimeDelay(100);

    // Verify we start in main list view
    let output = lastFrame();
    expect(output).toContain('test-project/feature-1');
    expect(output).toContain('test-project/feature-2');
    expect(output).toContain('Enter attach, n new, a archive');

    // Simulate the archive dialog being shown (manually set UI mode)
    setUIMode('confirmArchive', {
      project: 'test-project',
      feature: 'feature-1',
      hasActiveSession: false
    });
    await simulateTimeDelay(50);
    
    // Should show archive confirmation dialog
    output = lastFrame();
    expect(output).toContain('Archive Feature');
    expect(output).toContain('Are you sure you want to archive test-project/feature-1');

    // Simulate canceling the dialog (manually return to list mode)
    setUIMode('list');
    await simulateTimeDelay(50);

    // After fix: Should properly return to main list view
    output = lastFrame();
    console.log('Output after cancel:', JSON.stringify(output));
    
    // What we expect (should be back to main view)
    expect(output).toContain('test-project/feature-1');
    expect(output).toContain('test-project/feature-2');
    expect(output).toContain('Enter attach, n new, a archive');
    
    // Should NOT be blank or empty
    expect(output.trim()).not.toBe('');
    expect(output).not.toContain('No worktrees found'); // Should not show empty state
  });

  test('should properly handle create feature dialog cancellation', async () => {
    createProjectWithFeatures('test-project', ['feature-1']);

    const {lastFrame, setUIMode} = renderTestApp();
    await simulateTimeDelay(100);

    // Verify we start in main list view
    let output = lastFrame();
    expect(output).toContain('test-project/feature-1');

    // Simulate create feature dialog
    setUIMode('create', {
      projects: [{name: 'test-project'}],
      defaultProject: 'test-project',
      featureName: ''
    });
    await simulateTimeDelay(50);
    
    // Should show create feature dialog
    output = lastFrame();
    expect(output).toContain('Create Feature');
    expect(output).toContain('Select Project:');

    // Simulate canceling dialog
    setUIMode('list');
    await simulateTimeDelay(50);

    // Should return to main list view
    output = lastFrame();
    expect(output).toContain('test-project/feature-1');
    expect(output).toContain('Enter attach, n new, a archive');
    expect(output.trim()).not.toBe('');
    expect(output).not.toContain('No worktrees found'); // Should not show empty state
  });

  test('should properly handle help dialog closure', async () => {
    createProjectWithFeatures('test-project', ['feature-1']);

    const {lastFrame, setUIMode} = renderTestApp();
    await simulateTimeDelay(100);

    // Verify we start in main list view
    let output = lastFrame();
    expect(output).toContain('test-project/feature-1');

    // Simulate help dialog
    setUIMode('help');
    await simulateTimeDelay(50);
    
    // Should show help dialog
    output = lastFrame();
    expect(output).toContain('Help');
    expect(output).toContain('Keyboard Shortcuts');

    // Simulate closing help
    setUIMode('list');
    await simulateTimeDelay(50);

    // Should return to main list view
    output = lastFrame();
    expect(output).toContain('test-project/feature-1');
    expect(output).toContain('Enter attach, n new, a archive');
    expect(output.trim()).not.toBe('');
    expect(output).not.toContain('No worktrees found'); // Should not show empty state
  });
});