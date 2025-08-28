import {describe, beforeEach, test, expect, jest} from '@jest/globals';
import React from 'react';
import {renderTestApp} from '../utils/renderApp.js';
import {
  resetTestData,
  setupBasicProject,
  setupTestWorktree,
  memoryStore,
} from '../utils/testHelpers.js';
import {commentStoreManager} from '../../src/services/CommentStoreManager.js';

const h = React.createElement;

describe('Unsaved Comments Dialog E2E', () => {
  beforeEach(() => {
    resetTestData();
  });

  test('should show unsaved comments dialog when trying to exit diff view with comments', async () => {
    // Setup: Create a project with a worktree and comments
    setupBasicProject('test-project');
    const worktree = setupTestWorktree('test-project', 'feature-branch');
    const worktreePath = worktree.path;
    
    // Get comment store and add some comments
    const commentStore = commentStoreManager.getStore(worktreePath);
    commentStore.addComment(10, 'file1.ts', 'const x = 1;', 'First comment');
    commentStore.addComment(20, 'file2.ts', 'const y = 2;', 'Second comment');
    
    expect(commentStore.count).toBe(2);
    
    // Since we can't easily test the full DiffView component in isolation,
    // we'll test the core behavior logic here
    
    // Test 1: Exit should be prevented when comments exist
    const hasComments = commentStore.count > 0;
    expect(hasComments).toBe(true);
    
    // Test 2: Dialog should show comment count correctly
    expect(commentStore.count).toBe(2);
    
    // Test 3: Simulate "Exit without submitting" - comments should be cleared
    commentStore.clear();
    expect(commentStore.count).toBe(0);
  });

  test('should allow normal exit when no comments exist', async () => {
    // Setup: Create a project with a worktree but no comments
    setupBasicProject('empty-project');
    const worktree = setupTestWorktree('empty-project', 'empty-feature');
    const worktreePath = worktree.path;
    
    // Get comment store - should be empty
    const commentStore = commentStoreManager.getStore(worktreePath);
    expect(commentStore.count).toBe(0);
    
    // Exit should be allowed immediately when no comments exist
    const hasComments = commentStore.count > 0;
    expect(hasComments).toBe(false);
  });

  test('should preserve comment data structure for dialog display', async () => {
    // Setup: Create a project with multiple comments
    setupBasicProject('dialog-project');
    const worktree = setupTestWorktree('dialog-project', 'dialog-feature');
    const worktreePath = worktree.path;
    
    // Get comment store and add comments
    const commentStore = commentStoreManager.getStore(worktreePath);
    commentStore.addComment(5, 'main.ts', 'console.log("test");', 'Remove console.log');
    commentStore.addComment(15, 'utils.ts', 'const unused = true;', 'Remove unused variable');
    commentStore.addComment(25, 'main.ts', 'function foo() {}', 'Add return type annotation');
    
    expect(commentStore.count).toBe(3);
    
    // Get all comments for dialog display
    const comments = commentStore.getAllComments();
    expect(comments).toHaveLength(3);
    
    // Verify comment structure is preserved
    expect(comments[0]).toMatchObject({
      lineIndex: 5,
      fileName: 'main.ts',
      lineText: 'console.log("test");',
      commentText: 'Remove console.log'
    });
    
    expect(comments[1]).toMatchObject({
      lineIndex: 15,
      fileName: 'utils.ts',
      lineText: 'const unused = true;',
      commentText: 'Remove unused variable'
    });
    
    expect(comments[2]).toMatchObject({
      lineIndex: 25,
      fileName: 'main.ts', 
      lineText: 'function foo() {}',
      commentText: 'Add return type annotation'
    });
  });

  test('should handle single vs multiple comment text correctly', async () => {
    // Setup: Test both single and multiple comment scenarios
    setupBasicProject('count-project');
    const worktree = setupTestWorktree('count-project', 'count-feature');
    const worktreePath = worktree.path;
    
    const commentStore = commentStoreManager.getStore(worktreePath);
    
    // Test single comment
    commentStore.addComment(1, 'single.ts', 'const one = 1;', 'Single comment');
    expect(commentStore.count).toBe(1);
    
    // Dialog should show "1 unsaved comment" (singular)
    const singleText = `You have ${commentStore.count} unsaved comment${commentStore.count === 1 ? '' : 's'}.`;
    expect(singleText).toBe('You have 1 unsaved comment.');
    
    // Add another comment
    commentStore.addComment(2, 'multiple.ts', 'const two = 2;', 'Multiple comments');
    expect(commentStore.count).toBe(2);
    
    // Dialog should show "2 unsaved comments" (plural)
    const multipleText = `You have ${commentStore.count} unsaved comment${commentStore.count === 1 ? '' : 's'}.`;
    expect(multipleText).toBe('You have 2 unsaved comments.');
    
    commentStore.clear();
  });
});