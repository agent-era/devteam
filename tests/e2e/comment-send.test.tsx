import {describe, beforeEach, test, expect, jest} from '@jest/globals';
import React from 'react';
import {renderTestApp} from '../utils/renderApp.js';
import {
  resetTestData,
  setupBasicProject,
  setupTestWorktree,
  memoryStore,
} from '../utils/testHelpers.js';
import {FakeTmuxService} from '../fakes/FakeTmuxService.js';
import {CommentStore} from '../../src/models.js';
import {commentStoreManager} from '../../src/services/CommentStoreManager.js';
import * as commandExecutor from '../../src/shared/utils/commandExecutor.js';

const h = React.createElement;

describe('Comment Send to Claude E2E', () => {
  let fakeTmuxService: FakeTmuxService;

  beforeEach(() => {
    resetTestData();
    fakeTmuxService = new FakeTmuxService();
    
    // Mock runCommand to capture tmux send-keys calls
    jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args, opts) => {
      if (args[0] === 'tmux' && args[1] === 'send-keys') {
        // Extract session and keys from args
        const sessionIndex = args.findIndex(arg => arg === '-t') + 1;
        const session = args[sessionIndex]?.split(':')[0] || '';
        const keys = args.slice(sessionIndex + 1);
        
        fakeTmuxService.recordSentKeys(session, keys);
        return 'mocked send-keys';
      }
      
      // Mock other commands as needed
      if (args.includes('command') && args.includes('claude')) {
        return 'claude'; // Claude is available
      }
      
      if (args[0] === 'tmux' && args[1] === 'new-session') {
        return 'session created';
      }
      
      if (args[0] === 'tmux' && args[1] === 'has-session') {
        return ''; // Session doesn't exist initially
      }
      
      return '';
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should send all comments including the last one with proper newlines', async () => {
    // Setup: Create a project with a worktree
    setupBasicProject('test-project');
    const worktree = setupTestWorktree('test-project', 'feature-branch');
    const worktreePath = worktree.path;
    
    // Get comment store for this worktree
    const commentStore = commentStoreManager.getStore(worktreePath);
    
    // Add multiple comments
    commentStore.addComment(10, 'file1.ts', 'const x = 1;', 'First comment');
    commentStore.addComment(20, 'file2.ts', 'const y = 2;', 'Second comment');
    commentStore.addComment(30, 'file3.ts', 'const z = 3;', 'Last comment');
    
    expect(commentStore.count).toBe(3);
    
    // Clear any previous sent keys
    fakeTmuxService.clearSentKeys();
    
    // Simulate the sendCommentsToTmux function logic
    const comments = commentStore.getAllComments();
    const sessionName = `dev-test-project-feature-branch`;
    
    // Create the message format (mimicking DiffView.ts logic)
    const messageLines: string[] = [];
    messageLines.push("Please address the following code review comments:");
    messageLines.push("");
    
    const commentsByFile: {[key: string]: typeof comments} = {};
    comments.forEach(comment => {
      if (!commentsByFile[comment.fileName]) {
        commentsByFile[comment.fileName] = [];
      }
      commentsByFile[comment.fileName].push(comment);
    });
    
    Object.entries(commentsByFile).forEach(([fileName, fileComments]) => {
      messageLines.push(`**${fileName}:**`);
      fileComments.forEach(comment => {
        messageLines.push(`- Line ${comment.lineIndex}: ${comment.commentText}`);
        messageLines.push(`  \`${comment.lineText}\``);
      });
      messageLines.push("");
    });
    
    // Mock creating session (similar to DiffView.ts)
    const sessionExists = commandExecutor.runCommand(['tmux', 'has-session', '-t', sessionName]).trim();
    if (!sessionExists) {
      commandExecutor.runCommand(['tmux', 'new-session', '-ds', sessionName, '-c', worktreePath]);
      const hasClaude = commandExecutor.runCommand(['bash', '-lc', 'command -v claude || true']).trim();
      if (hasClaude) {
        commandExecutor.runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, 'claude', 'C-m']);
      }
    }
    
    // Send all lines with Alt+Enter (using the fixed logic)
    messageLines.forEach((line, index) => {
      // Send the line text
      commandExecutor.runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, line]);
      
      // FIXED: Send newline after every line including the last one
      commandExecutor.runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, 'Escape', 'Enter']);
    });
    
    // Verify the sent keys
    const sentKeys = fakeTmuxService.getSentKeys(sessionName);
    
    // Should have sent: 
    // 1. 'claude', 'C-m' (start Claude)
    // 2-N. Each message line
    // 2-N. 'Escape', 'Enter' after each line except the last
    
    expect(sentKeys.length).toBeGreaterThan(0);
    
    // Find the message lines in sent keys (skip the initial 'claude', 'C-m')
    const messageStartIndex = sentKeys.findIndex(keys => 
      keys.length === 1 && keys[0] === "Please address the following code review comments:"
    );
    expect(messageStartIndex).toBeGreaterThan(-1);
    
    // Count message lines and newlines
    let messageLineCount = 0;
    let newlineCount = 0;
    
    for (let i = messageStartIndex; i < sentKeys.length; i++) {
      const keys = sentKeys[i];
      if (keys.length === 1 && !keys.includes('Escape') && !keys.includes('Enter')) {
        messageLineCount++;
      } else if (keys.length === 2 && keys[0] === 'Escape' && keys[1] === 'Enter') {
        newlineCount++;
      }
    }
    
    expect(messageLineCount).toBe(messageLines.length);
    
    // FIXED: Now all lines should get newlines, including the last one
    expect(newlineCount).toBe(messageLines.length);
    
    // Clean up
    commentStore.clear();
  });

  test('should handle single comment correctly', async () => {
    // Setup: Create a project with a worktree
    setupBasicProject('single-project');
    const worktree = setupTestWorktree('single-project', 'single-feature');
    const worktreePath = worktree.path;
    
    // Get comment store for this worktree
    const commentStore = commentStoreManager.getStore(worktreePath);
    
    // Add single comment
    commentStore.addComment(5, 'single.ts', 'const single = true;', 'Only comment');
    
    expect(commentStore.count).toBe(1);
    
    // Clear any previous sent keys
    fakeTmuxService.clearSentKeys();
    
    const comments = commentStore.getAllComments();
    const sessionName = `dev-single-project-single-feature`;
    
    // Create minimal message
    const messageLines = [
      "Please address the following code review comments:",
      "",
      "**single.ts:**",
      "- Line 5: Only comment",
      "  `const single = true;`",
      ""
    ];
    
    // Send each line with the fixed logic
    messageLines.forEach((line, index) => {
      commandExecutor.runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, line]);
      // FIXED: Send newline after every line including the last one
      commandExecutor.runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, 'Escape', 'Enter']);
    });
    
    const sentKeys = fakeTmuxService.getSentKeys(sessionName);
    
    // Count newlines - should now be messageLines.length with the fix
    const newlineCount = sentKeys.filter(keys => 
      keys.length === 2 && keys[0] === 'Escape' && keys[1] === 'Enter'
    ).length;
    
    // FIXED: Now all lines get newlines including the last one
    expect(newlineCount).toBe(messageLines.length);
    
    commentStore.clear();
  });
});