import {describe, beforeEach, test, expect} from '@jest/globals';
import {FakeWorktreeService} from '../fakes/FakeWorktreeService.js';
import {
  resetTestData,
  setupTestProject,
  setupTestWorktree,
  expectWorktreeInMemory,
  expectWorktreeNotInMemory,
  expectArchivedWorktree,
  memoryStore
} from '../utils/testHelpers.js';

describe('Unarchive Bug Investigation', () => {
  let worktreeService: FakeWorktreeService;

  beforeEach(() => {
    resetTestData();
    worktreeService = new FakeWorktreeService();
  });

  test('should show restored worktree in active list after unarchive', async () => {
    // Given: A project with a worktree that gets archived
    setupTestProject('test-project');
    const worktree = setupTestWorktree('test-project', 'test-feature');
    
    // Verify worktree is initially active
    expectWorktreeInMemory('test-project', 'test-feature');
    const initialWorktrees = worktreeService.getAllWorktrees();
    expect(initialWorktrees).toHaveLength(1);
    expect(initialWorktrees[0].feature).toBe('test-feature');
    
    // Archive the worktree
    const {archivedPath} = await worktreeService.archiveFeature(worktree);
    
    // Verify it's archived and not in active list
    expectWorktreeNotInMemory('test-project', 'test-feature');
    expectArchivedWorktree('test-project', 'test-feature');
    const activeWorktreesAfterArchive = worktreeService.getAllWorktrees();
    expect(activeWorktreesAfterArchive).toHaveLength(0);
    
    // When: Unarchiving the worktree
    const {restoredPath} = await worktreeService.unarchiveFeature(archivedPath);
    
    // Then: The worktree should appear in the active list again
    const activeWorktreesAfterUnarchive = worktreeService.getAllWorktrees();
    expect(activeWorktreesAfterUnarchive).toHaveLength(1);
    expect(activeWorktreesAfterUnarchive[0].feature).toBe('test-feature');
    expect(activeWorktreesAfterUnarchive[0].project).toBe('test-project');
    
    // And: Should be back in memory store
    expectWorktreeInMemory('test-project', 'test-feature');
    
    // And: Should not be in archived list anymore
    const archivedAfterUnarchive = worktreeService.getArchivedForProject({name: 'test-project', path: '/fake/projects/test-project'});
    expect(archivedAfterUnarchive).toHaveLength(0);
    
    // Verify the restored path is correct
    expect(restoredPath).toContain('test-project-branches');
    expect(restoredPath).toContain('test-feature');
  });
  
  test('should handle multiple unarchive operations correctly', async () => {
    // Given: Multiple archived worktrees
    setupTestProject('test-project');
    const worktree1 = setupTestWorktree('test-project', 'feature-1');
    const worktree2 = setupTestWorktree('test-project', 'feature-2');
    
    const {archivedPath: archived1} = await worktreeService.archiveFeature(worktree1);
    const {archivedPath: archived2} = await worktreeService.archiveFeature(worktree2);
    
    // Verify both are archived
    expect(worktreeService.getAllWorktrees()).toHaveLength(0);
    
    // When: Unarchiving both
    await worktreeService.unarchiveFeature(archived1);
    await worktreeService.unarchiveFeature(archived2);
    
    // Then: Both should be in active list
    const activeWorktrees = worktreeService.getAllWorktrees();
    expect(activeWorktrees).toHaveLength(2);
    
    const features = activeWorktrees.map(w => w.feature).sort();
    expect(features).toEqual(['feature-1', 'feature-2']);
  });
  
  test('should preserve worktree data during unarchive cycle', async () => {
    // Given: A worktree with specific properties
    setupTestProject('test-project');
    const originalWorktree = setupTestWorktree('test-project', 'test-feature');
    originalWorktree.branch = 'feature/test-feature';
    originalWorktree.path = '/fake/projects/test-project-branches/test-feature';
    
    // Archive and then unarchive
    const {archivedPath} = await worktreeService.archiveFeature(originalWorktree);
    const {restoredPath} = await worktreeService.unarchiveFeature(archivedPath);
    
    // Then: Restored worktree should have same properties
    const restoredWorktrees = worktreeService.getAllWorktrees();
    expect(restoredWorktrees).toHaveLength(1);
    
    const restoredWorktree = restoredWorktrees[0];
    expect(restoredWorktree.project).toBe(originalWorktree.project);
    expect(restoredWorktree.feature).toBe(originalWorktree.feature);
    expect(restoredWorktree.branch).toBe(originalWorktree.branch);
    expect(restoredWorktree.path).toBe(originalWorktree.path);
  });
});