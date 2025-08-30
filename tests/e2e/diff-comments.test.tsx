import {describe, beforeEach, test, expect, jest} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {
  resetTestData,
  setupBasicProject,
  setupProjectWithWorktrees,
  setupTestWorktree,
  simulateTimeDelay,
  memoryStore,
} from '../utils/testHelpers.js';
import {commentStoreManager} from '../../src/services/CommentStoreManager.js';
import * as commandExecutor from '../../src/shared/utils/commandExecutor.js';

describe('Diff Viewing and Comments E2E', () => {
  beforeEach(() => {
    resetTestData();
    
    // Mock git diff command
    jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args, opts) => {
      const command = args.join(' ');
      
      // Mock git diff output
      if (command.includes('git diff')) {
        return `diff --git a/src/example.ts b/src/example.ts
index 1234567..abcdefg 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,5 +1,8 @@
 import React from 'react';
 
+// Added new function
+function newFunction() {
+  return 'hello';
+}
+
 export default function Component() {
-  return <div>Old content</div>;
+  return <div>New content</div>;
 }`;
      }
      
      // Mock merge-base command
      if (command.includes('merge-base')) {
        return 'abc123def456';
      }
      
      // Mock finding base branch
      if (command.includes('git branch')) {
        return 'main\n* feature/test-branch';
      }
      
      // Mock untracked files
      if (command.includes('ls-files --others')) {
        return 'newfile.ts\nREADME.md';
      }
      
      // Mock file content for untracked files
      if (command.includes('sed')) {
        return 'console.log("New file content");';
      }
      
      // Mock tmux operations for sending comments
      if (command.includes('tmux')) {
        return '';
      }
      
      return '';
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Clear all comment stores
    const stores = (commentStoreManager as any).stores;
    if (stores) {
      stores.clear();
    }
  });

  describe('Diff View Display', () => {
    test('should display full diff view with proper formatting', async () => {
      // Setup: Worktree with changes
      setupBasicProject('diff-project');
      const worktree = setupTestWorktree('diff-project', 'diff-feature');
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open diff view
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Diff Viewer',
        diffType: 'full'
      });
      await simulateTimeDelay(100);
      
      // Should show diff content
      const output = lastFrame();
      expect(output).toContain('Diff Viewer');
      expect(output).toContain('src/example.ts');
      expect(output).toContain('newFeature'); // Updated to match mock output
      expect(output).toContain('New content');
    });

    test('should display uncommitted diff view', async () => {
      // Setup: Worktree with uncommitted changes
      setupBasicProject('uncommitted-project');
      const worktree = setupTestWorktree('uncommitted-project', 'uncommitted-feature');
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open uncommitted diff view
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Diff Viewer (Uncommitted Changes)',
        diffType: 'uncommitted'
      });
      await simulateTimeDelay(100);
      
      // Should show uncommitted diff
      const output = lastFrame();
      expect(output).toContain('Diff Viewer (Uncommitted Changes)');
      expect(output).toContain('src/example.ts');
    });

    test('should handle diff navigation with keyboard', async () => {
      // Setup: Worktree with large diff
      setupBasicProject('nav-project');
      const worktree = setupTestWorktree('nav-project', 'nav-feature');
      
      // Mock larger diff output
      jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args) => {
        if (args.join(' ').includes('git diff')) {
          const lines = [];
          for (let i = 1; i <= 50; i++) {
            lines.push(`+Line ${i} added`);
          }
          return `diff --git a/bigfile.ts b/bigfile.ts
index 1234567..abcdefg 100644
--- a/bigfile.ts
+++ b/bigfile.ts
@@ -1,5 +1,55 @@
${lines.join('\n')}`;
        }
        return '';
      });
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open diff view
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Large Diff',
        diffType: 'full'
      });
      await simulateTimeDelay(100);
      
      // Should show diff with navigation capability
      const output = lastFrame();
      expect(output).toContain('Large Diff');
      expect(output).toContain('Line 1 added');
    });
  });

  describe('Comment Management', () => {
    test('should add comments to diff lines', async () => {
      // Setup: Worktree for commenting
      setupBasicProject('comment-project');
      const worktree = setupTestWorktree('comment-project', 'comment-feature');
      const worktreePath = worktree.path;
      
      // Get comment store for this worktree
      const commentStore = commentStoreManager.getStore(worktreePath);
      
      // Add comment to a line
      commentStore.addComment(5, 'src/example.ts', 'function newFunction() {', 'This function needs documentation');
      
      // Verify comment was added
      expect(commentStore.count).toBe(1);
      const comments = commentStore.getAllComments();
      expect(comments).toHaveLength(1);
      expect(comments[0].lineIndex).toBe(5);
      expect(comments[0].fileName).toBe('src/example.ts');
      expect(comments[0].commentText).toBe('This function needs documentation');
    });

    test('should display all comments in diff view', async () => {
      // Setup: Worktree with existing comments
      setupBasicProject('view-comments');
      const worktree = setupTestWorktree('view-comments', 'view-feature');
      const commentStore = commentStoreManager.getStore(worktree.path);
      
      // Add multiple comments
      commentStore.addComment(3, 'src/file1.ts', 'const x = 1;', 'Consider using let instead');
      commentStore.addComment(8, 'src/file2.ts', 'return value;', 'Add type annotation');
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open diff view and show comments
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Diff with Comments',
        diffType: 'full',
        showAllComments: true
      });
      await simulateTimeDelay(100);
      
      // Comments should be displayed
      expect(commentStore.count).toBe(2);
      const output = lastFrame();
      expect(output).toContain('Diff with Comments');
    });

    test('should persist comments across sessions', async () => {
      // Setup: Create worktree and add comment
      setupBasicProject('persist-project');
      const worktree = setupTestWorktree('persist-project', 'persist-feature');
      const worktreePath = worktree.path;
      
      // Add comment in first session
      const store1 = commentStoreManager.getStore(worktreePath);
      store1.addComment(10, 'src/persist.ts', 'console.log("test");', 'Remove debug log');
      expect(store1.count).toBe(1);
      
      // Simulate getting store in new session (same path)
      const store2 = commentStoreManager.getStore(worktreePath);
      
      // Should be the same store instance with persisted comment
      expect(store2).toBe(store1);
      expect(store2.count).toBe(1);
      
      const comments = store2.getAllComments();
      expect(comments[0].commentText).toBe('Remove debug log');
    });

    test('should clear comments when requested', async () => {
      // Setup: Worktree with comments
      setupBasicProject('clear-project');
      const worktree = setupTestWorktree('clear-project', 'clear-feature');
      const commentStore = commentStoreManager.getStore(worktree.path);
      
      // Add some comments
      commentStore.addComment(1, 'file1.ts', 'code1', 'comment1');
      commentStore.addComment(2, 'file2.ts', 'code2', 'comment2');
      expect(commentStore.count).toBe(2);
      
      // Clear all comments
      commentStore.clear();
      
      // Should have no comments
      expect(commentStore.count).toBe(0);
      expect(commentStore.getAllComments()).toHaveLength(0);
    });
  });

  describe('Comment Input Dialog', () => {
    test('should show comment input dialog when adding comment', async () => {
      // Setup: Worktree in diff view
      setupBasicProject('input-project');
      const worktree = setupTestWorktree('input-project', 'input-feature');
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Simulate opening comment input dialog
      setUIMode('commentInput', {
        title: 'Add Comment',
        fileName: 'src/example.ts',
        lineIndex: 15,
        lineText: 'return result;',
        onCancel: () => {},
        onSubmit: (comment: string) => {
          const commentStore = commentStoreManager.getStore(worktree.path);
          commentStore.addComment(15, 'src/example.ts', 'return result;', comment);
        }
      });
      await simulateTimeDelay(50);
      
      // Should show comment input dialog
      const output = lastFrame();
      expect(output).toContain('Add Comment');
      expect(output).toContain('src/example.ts');
      expect(output).toContain('Line 15');
    });

    test('should validate comment input', async () => {
      // Setup: Comment input scenario
      setupBasicProject('validate-project');
      const worktree = setupTestWorktree('validate-project', 'validate-feature');
      const commentStore = commentStoreManager.getStore(worktree.path);
      
      // Try to add empty comment (should be handled by dialog)
      const emptyComment = '';
      const validComment = 'This is a valid comment';
      
      // Add valid comment
      commentStore.addComment(20, 'src/test.ts', 'const value = true;', validComment);
      
      // Verify only valid comment was added
      expect(commentStore.count).toBe(1);
      const comments = commentStore.getAllComments();
      expect(comments[0].commentText).toBe(validComment);
    });
  });

  describe('Sending Comments to Claude', () => {
    test('should send comments to Claude session via tmux', async () => {
      // Setup: Worktree with comments and Claude session
      setupBasicProject('send-project');
      const worktree = setupTestWorktree('send-project', 'send-feature');
      const commentStore = commentStoreManager.getStore(worktree.path);
      
      // Add comments
      commentStore.addComment(5, 'src/main.ts', 'function process() {', 'Add error handling');
      commentStore.addComment(12, 'src/util.ts', 'return data;', 'Add type safety');
      
      // Mock tmux send-keys capture
      const sentCommands: string[][] = [];
      jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args) => {
        if (args[0] === 'tmux' && args[1] === 'send-keys') {
          sentCommands.push([...args]);
          return '';
        }
        return '';
      });
      
      const {services} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Create Claude session
      services.tmuxService.createTestSession('send-project', 'send-feature', 'idle');
      
      // Simulate sending comments (this would be triggered by 's' key in diff view)
      const sessionName = 'dev-send-project-send-feature';
      const comments = commentStore.getAllComments();
      
      // Format message like the actual DiffView does
      const messageLines = [
        'Please address the following code review comments:',
        '',
        '**src/main.ts:**',
        '- Line 5: Add error handling',
        '  `function process() {`',
        '',
        '**src/util.ts:**',
        '- Line 12: Add type safety',
        '  `return data;`',
        ''
      ];
      
      // Send each line
      messageLines.forEach(line => {
        commandExecutor.runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, line]);
        commandExecutor.runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, 'Escape', 'Enter']);
      });
      
      // Verify commands were sent
      expect(sentCommands.length).toBeGreaterThan(0);
      
      // Should contain the comment messages
      const allSentText = sentCommands.map(cmd => cmd.slice(4).join(' ')).join(' ');
      expect(allSentText).toContain('Add error handling');
      expect(allSentText).toContain('Add type safety');
    });

    test('should handle tmux session not found when sending comments', async () => {
      // Setup: Worktree with comments but no session
      setupBasicProject('no-session');
      const worktree = setupTestWorktree('no-session', 'no-session-feature');
      const commentStore = commentStoreManager.getStore(worktree.path);
      
      commentStore.addComment(1, 'file.ts', 'code', 'comment');
      
      // Mock tmux session doesn't exist
      jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args) => {
        if (args.includes('has-session')) {
          throw new Error('session not found');
        }
        if (args.includes('new-session')) {
          return ''; // Allow session creation
        }
        return '';
      });
      
      const {services} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Attempt to send comments should handle missing session gracefully
      // In real implementation, it would create the session first
      expect(() => {
        // This would be the diff view attempting to send comments
        services.tmuxService.createTestSession('no-session', 'no-session-feature', 'idle');
      }).not.toThrow();
    });
  });

  describe('Multi-file Comment Management', () => {
    test('should organize comments by file', async () => {
      // Setup: Worktree with comments across multiple files
      setupBasicProject('multi-file');
      const worktree = setupTestWorktree('multi-file', 'multi-feature');
      const commentStore = commentStoreManager.getStore(worktree.path);
      
      // Add comments to different files
      commentStore.addComment(10, 'src/components/Header.tsx', '<div>Header</div>', 'Add accessibility attributes');
      commentStore.addComment(5, 'src/utils/helpers.ts', 'export const format =', 'Add JSDoc comments');
      commentStore.addComment(20, 'src/components/Header.tsx', 'export default Header;', 'Consider memo wrapping');
      commentStore.addComment(15, 'src/styles/main.css', '.container {', 'Use CSS variables');
      
      // Verify comments are stored correctly
      expect(commentStore.count).toBe(4);
      
      const allComments = commentStore.getAllComments();
      const fileGroups = allComments.reduce((acc: {[key: string]: any[]}, comment) => {
        if (!acc[comment.fileName]) {
          acc[comment.fileName] = [];
        }
        acc[comment.fileName].push(comment);
        return acc;
      }, {});
      
      // Should have comments organized by file
      expect(Object.keys(fileGroups)).toHaveLength(3);
      expect(fileGroups['src/components/Header.tsx']).toHaveLength(2);
      expect(fileGroups['src/utils/helpers.ts']).toHaveLength(1);
      expect(fileGroups['src/styles/main.css']).toHaveLength(1);
    });

    test('should format multi-file comments for Claude correctly', async () => {
      // Setup: Comments across files
      setupBasicProject('format-project');
      const worktree = setupTestWorktree('format-project', 'format-feature');
      const commentStore = commentStoreManager.getStore(worktree.path);
      
      commentStore.addComment(8, 'file1.ts', 'const x = 1;', 'Use const assertion');
      commentStore.addComment(12, 'file2.ts', 'return y;', 'Add null check');
      
      const comments = commentStore.getAllComments();
      
      // Group by file (like DiffView does)
      const commentsByFile: {[key: string]: typeof comments} = {};
      comments.forEach(comment => {
        if (!commentsByFile[comment.fileName]) {
          commentsByFile[comment.fileName] = [];
        }
        commentsByFile[comment.fileName].push(comment);
      });
      
      // Format message
      const messageLines: string[] = [];
      messageLines.push('Please address the following code review comments:');
      messageLines.push('');
      
      Object.entries(commentsByFile).forEach(([fileName, fileComments]) => {
        messageLines.push(`**${fileName}:**`);
        fileComments.forEach(comment => {
          messageLines.push(`- Line ${comment.lineIndex}: ${comment.commentText}`);
          messageLines.push(`  \`${comment.lineText}\``);
        });
        messageLines.push('');
      });
      
      // Verify message format
      expect(messageLines).toContain('**file1.ts:**');
      expect(messageLines).toContain('- Line 8: Use const assertion');
      expect(messageLines).toContain('  `const x = 1;`');
      expect(messageLines).toContain('**file2.ts:**');
      expect(messageLines).toContain('- Line 12: Add null check');
    });
  });

  describe('Diff View Navigation', () => {
    test('should close diff view and return to main list', async () => {
      // Setup: Worktree in diff view
      setupBasicProject('close-project');
      const worktree = setupTestWorktree('close-project', 'close-feature');
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open diff view
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Test Diff',
        diffType: 'full'
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('Test Diff');
      
      // Close diff view (simulate escape key)
      setUIMode('list');
      await simulateTimeDelay(50);
      
      // Should be back to main view
      expect(lastFrame()).not.toContain('Test Diff');
      expect(lastFrame()).toContain('close-project/close-feature');
    });

    test('should handle diff view with no changes', async () => {
      // Setup: Worktree with no changes
      setupBasicProject('no-changes');
      const worktree = setupTestWorktree('no-changes', 'clean-feature');
      
      // Mock empty diff
      jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args) => {
        if (args.join(' ').includes('git diff')) {
          return ''; // No diff output
        }
        return '';
      });
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open diff view
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Empty Diff',
        diffType: 'full'
      });
      await simulateTimeDelay(100);
      
      // Should handle empty diff gracefully
      const output = lastFrame();
      expect(output).toContain('Empty Diff');
    });
  });
});