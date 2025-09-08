import {describe, beforeEach, test, expect} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {
  resetTestData,
  setupBasicProject,
  simulateTimeDelay,
  memoryStore,
} from '../utils/testHelpers.js';

describe('Zero-State E2E (mock-rendered)', () => {
  beforeEach(() => {
    resetTestData();
  });

  test('shows no-worktrees message when no projects exist', async () => {
    // No projects and no worktrees in memory
    const {lastFrame} = renderTestApp();
    await simulateTimeDelay(50);

    const output = lastFrame();
    expect(output).toContain('No worktrees found');
    expect(output).toContain('Ensure your projects have worktrees');
    expect(output).toContain('Press q to quit');
  });

  test('shows list header (no rows) when projects exist but no worktrees', async () => {
    // Project exists, but no worktrees yet
    setupBasicProject('demo');

    const {lastFrame} = renderTestApp();
    await simulateTimeDelay(50);

    const output = lastFrame();
    // Should not show the "no worktrees" zero-state since projects exist
    expect(output).not.toContain('No worktrees found');
    // Should show the main header and columns even with zero rows
    expect(output).toContain('Enter attach, n new, a archive, x exec, d diff, s shell, q quit');
    expect(output).toContain('#    PROJECT/FEATURE        AI  DIFF     CHANGES  PUSHED  PR');
  });

  test('transitions from empty to non-empty after creating first worktree', async () => {
    // Start with project and no worktrees
    setupBasicProject('demo');

    const {services, lastFrame} = renderTestApp();
    await simulateTimeDelay(50);

    // Initially no rows, show header
    let output = lastFrame();
    expect(output).toContain('#    PROJECT/FEATURE');
    expect(output).not.toContain('demo/');

    // Create first worktree via fake git service
    services.gitService.createWorktree('demo', 'first-feature');
    await simulateTimeDelay(100);

    output = lastFrame();
    expect(output).toContain('demo/first-feature');
  });
});

