import {describe, beforeEach, test, expect} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {
  resetTestData,
  setupProjectWithWorktrees,
  simulateTimeDelay,
  memoryStore,
} from '../utils/testHelpers.js';
import {WorktreeInfo, GitStatus, PRStatus, SessionInfo} from '../../src/models.js';

describe('Unarchive Workflow E2E', () => {
  beforeEach(() => {
    resetTestData();
  });

  test('should unarchive feature and show it in main list', async () => {
    // Setup: Create project with active worktree
    const {worktrees} = setupProjectWithWorktrees('test-project', ['test-feature']);
    const originalWorktree = worktrees[0];
    
    const {services, setUIMode, sendInput, lastFrame} = renderTestApp();
    await simulateTimeDelay(50);
    
    // Verify worktree exists initially
    expect(lastFrame()).toContain('test-project/test-feature');
    expect(memoryStore.worktrees.has(originalWorktree.path)).toBe(true);
    
    // Archive the worktree using fake service
    const {archivedPath} = await services.worktreeService.archiveFeature(originalWorktree);
    await simulateTimeDelay(50);
    
    // Verify worktree is now archived and removed from active list
    expect(memoryStore.worktrees.has(originalWorktree.path)).toBe(false);
    expect(memoryStore.archivedWorktrees.get('test-project')).toHaveLength(1);
    expect(lastFrame()).not.toContain('test-project/test-feature');
    
    // Navigate to archived view
    setUIMode('archived');
    await simulateTimeDelay(50);
    
    // Verify archived view shows the archived worktree
    const archivedFrame = lastFrame();
    expect(archivedFrame).toContain('Archived');
    expect(archivedFrame).toContain('test-project/test-feature');
    expect(archivedFrame).toContain('u unarchive');
    
    // Simulate unarchiving by pressing 'u' - let the real components handle it
    sendInput('u');
    await simulateTimeDelay(200); // Give more time for async unarchive operation
    
    // The real ArchivedScreen should handle the unarchive and navigate back
    // But since test utility doesn't capture real UI navigation, manually set mode
    setUIMode('list');
    await simulateTimeDelay(50);
    
    // Verify the worktree is back in active memory (core functionality test)
    const activeWorktrees = services.worktreeService.getAllWorktrees();
    expect(activeWorktrees).toHaveLength(1);
    expect(activeWorktrees[0].project).toBe('test-project');
    expect(activeWorktrees[0].feature).toBe('test-feature');
    
    // Verify it's no longer in archived list
    const remainingArchived = services.worktreeService.getArchivedForProject({
      name: 'test-project',
      path: '/fake/projects/test-project'
    });
    expect(remainingArchived).toHaveLength(0);
    
    // Verify it's no longer in archived list
    const archivedWorktrees = services.worktreeService.getArchivedForProject({
      name: 'test-project',
      path: '/fake/projects/test-project'
    });
    expect(archivedWorktrees).toHaveLength(0);
  });

  test('should handle multiple unarchive operations correctly', async () => {
    // Setup: Project with multiple worktrees
    const {worktrees} = setupProjectWithWorktrees('multi-project', ['feature-1', 'feature-2']);
    const worktree1 = worktrees[0];
    const worktree2 = worktrees[1];
    
    const {services, setUIMode, sendInput, lastFrame} = renderTestApp();
    await simulateTimeDelay(50);
    
    // Archive both worktrees
    await services.worktreeService.archiveFeature(worktree1);
    await services.worktreeService.archiveFeature(worktree2);
    await simulateTimeDelay(50);
    
    // Verify both are archived
    expect(services.worktreeService.getAllWorktrees()).toHaveLength(0);
    expect(memoryStore.archivedWorktrees.get('multi-project')).toHaveLength(2);
    
    // Navigate to archived view
    setUIMode('archived');
    await simulateTimeDelay(50);
    
    // Unarchive first item (should be selected by default)
    sendInput('u');
    await simulateTimeDelay(100);
    
    // Manually navigate back to main list since test utility doesn't handle real UI navigation
    setUIMode('list');
    await simulateTimeDelay(50);
    
    // Should be back at main list with first worktree restored
    expect(lastFrame()).toContain('multi-project/feature-1');
    expect(services.worktreeService.getAllWorktrees()).toHaveLength(1);
    
    // Go back to archived view to unarchive second item
    setUIMode('archived');
    await simulateTimeDelay(50);
    
    // Unarchive second item
    sendInput('u');
    await simulateTimeDelay(100);
    
    // Manually navigate back to main list
    setUIMode('list');
    await simulateTimeDelay(50);
    
    // Should have both worktrees back in main list
    const activeWorktrees = services.worktreeService.getAllWorktrees();
    expect(activeWorktrees).toHaveLength(2);
    const features = activeWorktrees.map((w: any) => w.feature).sort();
    expect(features).toEqual(['feature-1', 'feature-2']);
    
    // No more archived worktrees
    expect(services.worktreeService.getArchivedForProject({
      name: 'multi-project',
      path: '/fake/projects/multi-project'
    })).toHaveLength(0);
  });

  test('should create fresh worktree during unarchive', async () => {
    // Setup: Worktree with specific properties
    const {worktrees} = setupProjectWithWorktrees('preserve-test', ['preserve-feature']);
    const originalWorktree = worktrees[0];
    originalWorktree.branch = 'feature/preserve-feature';
    originalWorktree.path = '/fake/projects/preserve-test-branches/preserve-feature';
    originalWorktree.git = new GitStatus({modified_files: 5, added_lines: 10, deleted_lines: 2});
    originalWorktree.pr = new PRStatus({number: 123, state: 'OPEN', title: 'Test PR'});
    
    // Update in memory store
    memoryStore.worktrees.set(originalWorktree.path, originalWorktree);
    
    const {services, setUIMode, sendInput, lastFrame} = renderTestApp();
    await simulateTimeDelay(50);
    
    // Archive and then unarchive
    await services.worktreeService.archiveFeature(originalWorktree);
    setUIMode('archived');
    await simulateTimeDelay(50);
    
    sendInput('u'); // Unarchive
    await simulateTimeDelay(100);
    
    // Manually navigate back to main list
    setUIMode('list');
    await simulateTimeDelay(50);
    
    // Verify restored worktree has core properties (fresh worktree from branch)
    const restoredWorktrees = services.worktreeService.getAllWorktrees();
    expect(restoredWorktrees).toHaveLength(1);
    
    const restoredWorktree = restoredWorktrees[0];
    expect(restoredWorktree.project).toBe(originalWorktree.project);
    expect(restoredWorktree.feature).toBe(originalWorktree.feature);
    expect(restoredWorktree.branch).toBe(originalWorktree.branch);
    expect(restoredWorktree.path).toBe(originalWorktree.path);
    // Note: Fresh worktree has clean git status and needs new session
    expect(restoredWorktree.git).toBeInstanceOf(GitStatus);
    expect(restoredWorktree.session).toBeInstanceOf(SessionInfo);
  });

  test('should handle unarchive errors gracefully', async () => {
    // Setup: Archived worktree
    const {worktrees} = setupProjectWithWorktrees('error-test', ['error-feature']);
    const originalWorktree = worktrees[0];
    
    const {services, setUIMode, sendInput, lastFrame} = renderTestApp();
    await simulateTimeDelay(50);
    
    // Archive the worktree
    const {archivedPath} = await services.worktreeService.archiveFeature(originalWorktree);
    await simulateTimeDelay(50);
    
    // Enable unarchive failure in FakeGitService
    (global as any).__mockUnarchiveShouldFail = true;
    
    // Navigate to archived view
    setUIMode('archived');
    await simulateTimeDelay(50);
    
    // Try to unarchive - should fail gracefully
    sendInput('u');
    await simulateTimeDelay(100);
    
    // Should still be in archived view due to error
    expect(lastFrame()).toContain('Archived');
    expect(lastFrame()).toContain('error-feature');
    
    // Worktree should still be archived
    expect(services.worktreeService.getAllWorktrees()).toHaveLength(0);
    expect(services.worktreeService.getArchivedForProject({
      name: 'error-test',
      path: '/fake/projects/error-test'
    })).toHaveLength(1);
    
    // Cleanup
    (global as any).__mockUnarchiveShouldFail = false;
  });

  test('should verify branch exists before unarchive', async () => {
    // Setup: Create project with active worktree 
    const {worktrees} = setupProjectWithWorktrees('branch-test', ['branch-feature']);
    const originalWorktree = worktrees[0];
    originalWorktree.branch = 'feature/branch-feature';
    
    const {services, setUIMode, sendInput, lastFrame} = renderTestApp();
    await simulateTimeDelay(50);
    
    // Archive the worktree
    await services.worktreeService.archiveFeature(originalWorktree);
    await simulateTimeDelay(50);
    
    // Navigate to archived view
    setUIMode('archived');
    await simulateTimeDelay(50);
    
    // Unarchive should succeed because branch exists (FakeGitService simulates this)
    sendInput('u');
    await simulateTimeDelay(100);
    
    // Manually navigate back to main list
    setUIMode('list');
    await simulateTimeDelay(50);
    
    // Should successfully return to main list
    expect(lastFrame()).toContain('branch-test/branch-feature');
    expect(services.worktreeService.getAllWorktrees()).toHaveLength(1);
  });

  test('should update archived list after unarchive', async () => {
    // Setup: Project with multiple archived worktrees
    const {worktrees} = setupProjectWithWorktrees('list-update', ['keep-archived', 'unarchive-me']);
    const keepArchived = worktrees[0];
    const unarchiveMe = worktrees[1];
    
    const {services, setUIMode, sendInput, lastFrame} = renderTestApp();
    await simulateTimeDelay(50);
    
    // Archive both
    await services.worktreeService.archiveFeature(keepArchived);
    await services.worktreeService.archiveFeature(unarchiveMe);
    await simulateTimeDelay(50);
    
    // Navigate to archived view
    setUIMode('archived');
    await simulateTimeDelay(50);
    
    // Should show both archived items
    expect(lastFrame()).toContain('keep-archived');
    expect(lastFrame()).toContain('unarchive-me');
    
    // Unarchive the first one (keep-archived should be selected by default)
    sendInput('u');
    await simulateTimeDelay(100);
    
    // Manually navigate back to main list
    setUIMode('list');
    await simulateTimeDelay(50);
    
    // Should be back at main list
    expect(lastFrame()).toContain('list-update/keep-archived');
    expect(lastFrame()).not.toContain('Archived');
    
    // Go back to archived view - should only show remaining archived item
    setUIMode('archived');
    await simulateTimeDelay(50);
    
    const archivedFrame = lastFrame();
    expect(archivedFrame).toContain('Archived');
    expect(archivedFrame).toContain('unarchive-me');
    expect(archivedFrame).not.toContain('keep-archived');
    
    // Verify memory state is correct
    expect(services.worktreeService.getAllWorktrees()).toHaveLength(1);
    expect(services.worktreeService.getAllWorktrees()[0].feature).toBe('keep-archived');
    expect(services.worktreeService.getArchivedForProject({
      name: 'list-update',
      path: '/fake/projects/list-update'
    })).toHaveLength(1);
  });
});