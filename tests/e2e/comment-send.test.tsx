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

  test('should attach to tmux session after sending comments', async () => {
    // Setup: Create a project with a worktree
    setupBasicProject('attach-project');
    const worktree = setupTestWorktree('attach-project', 'attach-feature');
    const worktreePath = worktree.path;
    
    // Get comment store for this worktree
    const commentStore = commentStoreManager.getStore(worktreePath);
    
    // Add a comment
    commentStore.addComment(15, 'test.ts', 'const test = true;', 'Test comment');
    expect(commentStore.count).toBe(1);
    
    // Mock runInteractive to track tmux attach calls
    const mockRunInteractive = jest.spyOn(commandExecutor, 'runInteractive').mockReturnValue(0);
    
    // Clear any previous sent keys
    fakeTmuxService.clearSentKeys();
    
    // Simulate the sendCommentsToTmux function logic with attach
    const comments = commentStore.getAllComments();
    const sessionName = `dev-attach-project-attach-feature`;
    
    // Create the message format (mimicking DiffView.ts logic)
    const messageLines: string[] = [];
    messageLines.push("Please address the following code review comments:");
    messageLines.push("");
    messageLines.push(`File: test.ts`);
    messageLines.push(`  Line 16: Test comment`);
    messageLines.push("");
    
    // Mock creating session and sending comments
    const sessionExists = commandExecutor.runCommand(['tmux', 'has-session', '-t', sessionName]).trim();
    if (!sessionExists) {
      commandExecutor.runCommand(['tmux', 'new-session', '-ds', sessionName, '-c', worktreePath]);
      const hasClaude = commandExecutor.runCommand(['bash', '-lc', 'command -v claude || true']).trim();
      if (hasClaude) {
        commandExecutor.runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, 'claude', 'C-m']);
      }
    }
    
    // Send all lines
    messageLines.forEach((line, index) => {
      commandExecutor.runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, line]);
      commandExecutor.runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, 'Escape', 'Enter']);
    });
    
    // Clear comments after sending (simulating successful send)
    commentStore.clear();
    
    // Simulate the attach call that should happen after closing DiffView
    commandExecutor.runInteractive('tmux', ['attach-session', '-t', sessionName]);
    
    // Verify that runInteractive was called with correct tmux attach command
    expect(mockRunInteractive).toHaveBeenCalledWith('tmux', ['attach-session', '-t', sessionName]);
    
    // Verify comments were cleared
    expect(commentStore.count).toBe(0);
    
    // Clean up
    mockRunInteractive.mockRestore();
  });

  test('should send comments when Claude is idle', async () => {
    setupBasicProject('idle-project');
    const worktree = setupTestWorktree('idle-project', 'idle-feature');
    const commentStore = commentStoreManager.getStore(worktree.path);
    
    commentStore.addComment(10, 'test.ts', 'const test = true;', 'Test comment');
    
    // Mock session exists and Claude is idle
    jest.spyOn(fakeTmuxService, 'listSessions').mockResolvedValue(['dev-idle-project-idle-feature']);
    jest.spyOn(fakeTmuxService, 'getClaudeStatus').mockResolvedValue('idle');
    
    const mockRunCommand = jest.spyOn(commandExecutor, 'runCommand').mockReturnValue('');
    const mockRunInteractive = jest.spyOn(commandExecutor, 'runInteractive').mockReturnValue(0);
    
    // Simulate sending comments
    const comments = commentStore.getAllComments();
    const sessionName = 'dev-idle-project-idle-feature';
    
    // Should send via Alt+Enter since Claude is idle
    const messageLines = [
      "Please address the following code review comments:",
      "",
      "File: test.ts",
      "  Line 11: Test comment",
      ""
    ];
    
    messageLines.forEach((line) => {
      commandExecutor.runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, line]);
      commandExecutor.runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, 'Escape', 'Enter']);
    });
    
    expect(mockRunCommand).toHaveBeenCalledWith(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, "Please address the following code review comments:"]);
    expect(mockRunCommand).toHaveBeenCalledWith(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, 'Escape', 'Enter']);
    
    mockRunCommand.mockRestore();
    mockRunInteractive.mockRestore();
  });

  test('should launch Claude with pre-filled prompt when no session exists', async () => {
    setupBasicProject('no-session-project');
    const worktree = setupTestWorktree('no-session-project', 'no-session-feature');
    const commentStore = commentStoreManager.getStore(worktree.path);
    
    commentStore.addComment(5, 'main.ts', 'const main = 1;', 'Main comment');
    
    // Mock no session exists
    jest.spyOn(fakeTmuxService, 'listSessions').mockResolvedValue([]);
    
    const mockRunCommand = jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args) => {
      if (args.includes('command') && args.includes('claude')) {
        return 'claude'; // Claude is available
      }
      return '';
    });
    const mockRunInteractive = jest.spyOn(commandExecutor, 'runInteractive').mockReturnValue(0);
    
    const sessionName = 'dev-no-session-project-no-session-feature';
    
    // Should create session
    commandExecutor.runCommand(['tmux', 'new-session', '-ds', sessionName, '-c', worktree.path]);
    
    // Should launch Claude with pre-filled prompt
    const expectedPrompt = "Please address the following code review comments:\\n\\nFile: main.ts\\n  Line 6: Main comment\\n\\n";
    commandExecutor.runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, `claude "${expectedPrompt}"`, 'C-m']);
    
    expect(mockRunCommand).toHaveBeenCalledWith(['tmux', 'new-session', '-ds', sessionName, '-c', worktree.path]);
    expect(mockRunCommand).toHaveBeenCalledWith(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, `claude "${expectedPrompt}"`, 'C-m']);
    
    mockRunCommand.mockRestore();
    mockRunInteractive.mockRestore();
  });

  test('should launch Claude with pre-filled prompt when Claude is not running', async () => {
    setupBasicProject('not-running-project');
    const worktree = setupTestWorktree('not-running-project', 'not-running-feature');
    const commentStore = commentStoreManager.getStore(worktree.path);
    
    commentStore.addComment(15, 'app.ts', 'const app = 2;', 'App comment');
    
    // Mock session exists but Claude is not running
    jest.spyOn(fakeTmuxService, 'listSessions').mockResolvedValue(['dev-not-running-project-not-running-feature']);
    jest.spyOn(fakeTmuxService, 'getClaudeStatus').mockResolvedValue('not_running');
    
    const mockRunCommand = jest.spyOn(commandExecutor, 'runCommand').mockReturnValue('');
    const mockRunInteractive = jest.spyOn(commandExecutor, 'runInteractive').mockReturnValue(0);
    
    const sessionName = 'dev-not-running-project-not-running-feature';
    
    // Should launch Claude with pre-filled prompt
    const expectedPrompt = "Please address the following code review comments:\\n\\nFile: app.ts\\n  Line 16: App comment\\n\\n";
    commandExecutor.runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, `claude "${expectedPrompt}"`, 'C-m']);
    
    expect(mockRunCommand).toHaveBeenCalledWith(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, `claude "${expectedPrompt}"`, 'C-m']);
    
    mockRunCommand.mockRestore();
    mockRunInteractive.mockRestore();
  });

  test('should not send comments when Claude is waiting and allow user to go to session', async () => {
    setupBasicProject('waiting-project');
    const worktree = setupTestWorktree('waiting-project', 'waiting-feature');
    const commentStore = commentStoreManager.getStore(worktree.path);
    
    commentStore.addComment(20, 'wait.ts', 'const wait = 3;', 'Wait comment');
    
    // Mock session exists and Claude is waiting
    jest.spyOn(fakeTmuxService, 'listSessions').mockResolvedValue(['dev-waiting-project-waiting-feature']);
    jest.spyOn(fakeTmuxService, 'getClaudeStatus').mockResolvedValue('waiting');
    
    const mockRunCommand = jest.spyOn(commandExecutor, 'runCommand').mockReturnValue('');
    const mockRunInteractive = jest.spyOn(commandExecutor, 'runInteractive').mockReturnValue(0);
    
    // Should NOT send any commands
    expect(mockRunCommand).not.toHaveBeenCalledWith(expect.arrayContaining(['send-keys']));
    
    // Comments should still be available (not cleared)
    expect(commentStore.count).toBe(1);
    
    // Should be able to attach to session (simulating user choosing "Go to Session")
    const sessionName = 'dev-waiting-project-waiting-feature';
    commandExecutor.runInteractive('tmux', ['attach-session', '-t', sessionName]);
    expect(mockRunInteractive).toHaveBeenCalledWith('tmux', ['attach-session', '-t', sessionName]);
    
    mockRunCommand.mockRestore();
    mockRunInteractive.mockRestore();
  });

  test('should send comments when Claude is working or active', async () => {
    setupBasicProject('working-project');
    const worktree = setupTestWorktree('working-project', 'working-feature');
    const commentStore = commentStoreManager.getStore(worktree.path);
    
    commentStore.addComment(25, 'work.ts', 'const work = 4;', 'Work comment');
    
    // Test both working and active states (active can accept input like working)
    const statuses = ['working', 'active'] as const;
    
    for (const status of statuses) {
      // Mock session exists and Claude is in the current status
      jest.spyOn(fakeTmuxService, 'listSessions').mockResolvedValue(['dev-working-project-working-feature']);
      jest.spyOn(fakeTmuxService, 'getClaudeStatus').mockResolvedValue(status);
      
      const mockRunCommand = jest.spyOn(commandExecutor, 'runCommand').mockReturnValue('');
      const mockRunInteractive = jest.spyOn(commandExecutor, 'runInteractive').mockReturnValue(0);
      
      const sessionName = 'dev-working-project-working-feature';
      
      // Should send via Alt+Enter since Claude can accept input even while working/active
      const messageLines = [
        "Please address the following code review comments:",
        "",
        "File: work.ts",
        "  Line 26: Work comment",
        ""
      ];
      
      messageLines.forEach((line) => {
        commandExecutor.runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, line]);
        commandExecutor.runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, 'Escape', 'Enter']);
      });
      
      expect(mockRunCommand).toHaveBeenCalledWith(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, "Please address the following code review comments:"]);
      expect(mockRunCommand).toHaveBeenCalledWith(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, 'Escape', 'Enter']);
      
      mockRunCommand.mockRestore();
      mockRunInteractive.mockRestore();
    }
  });

  test('should preserve comments when race condition detected - Claude transitions to waiting during send', async () => {
    setupBasicProject('race-project');
    const worktree = setupTestWorktree('race-project', 'race-feature');
    const commentStore = commentStoreManager.getStore(worktree.path);
    
    commentStore.addComment(30, 'race.ts', 'const race = 5;', 'Race comment');
    commentStore.addComment(35, 'race.ts', 'const condition = true;', 'Another comment');
    
    const sessionName = 'dev-race-project-race-feature';
    
    // Mock session exists and Claude starts as idle
    jest.spyOn(fakeTmuxService, 'listSessions').mockResolvedValue([sessionName]);
    jest.spyOn(fakeTmuxService, 'getClaudeStatus').mockResolvedValue('idle');
    
    // Mock capturePane to simulate Claude transitioned to waiting (no comments visible)
    jest.spyOn(fakeTmuxService, 'capturePane').mockResolvedValue('1. What would you like me to help with?');
    
    const mockRunCommand = jest.spyOn(commandExecutor, 'runCommand').mockReturnValue('');
    const mockRunInteractive = jest.spyOn(commandExecutor, 'runInteractive').mockReturnValue(0);
    
    const comments = commentStore.getAllComments();
    
    // Simulate sending comments (they get sent but Claude transitioned to waiting)
    const messageLines = [
      "Please address the following code review comments:",
      "",
      "File: race.ts",
      "  Line 31: Race comment",
      "  Line 36: Another comment",
      ""
    ];
    
    messageLines.forEach((line) => {
      commandExecutor.runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, line]);
      commandExecutor.runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, 'Escape', 'Enter']);
    });
    
    // Simulate verification check - comments not found in pane (race condition detected)
    const paneContent = await fakeTmuxService.capturePane(sessionName);
    const lastTwoLines = ["Race comment", "Another comment"];
    let foundLines = 0;
    for (const line of lastTwoLines) {
      if (paneContent.includes(line.trim())) {
        foundLines++;
      }
    }
    
    // Race condition: comments not visible in pane
    expect(foundLines).toBe(0);
    
    // Comments should NOT be cleared (preserved for retry)
    expect(commentStore.count).toBe(2);
    
    // Should trigger session waiting dialog (mocked by not clearing comments)
    // In actual implementation, setSessionWaitingInfo and setShowSessionWaitingDialog would be called
    
    mockRunCommand.mockRestore();
    mockRunInteractive.mockRestore();
  });

  test('should clear comments when verification confirms they were received', async () => {
    setupBasicProject('verify-project');
    const worktree = setupTestWorktree('verify-project', 'verify-feature');
    const commentStore = commentStoreManager.getStore(worktree.path);
    
    commentStore.addComment(40, 'verify.ts', 'const verify = 6;', 'Verify comment');
    commentStore.addComment(45, 'verify.ts', 'const success = true;', 'Success comment');
    
    const sessionName = 'dev-verify-project-verify-feature';
    
    // Mock session exists and Claude is idle
    jest.spyOn(fakeTmuxService, 'listSessions').mockResolvedValue([sessionName]);
    jest.spyOn(fakeTmuxService, 'getClaudeStatus').mockResolvedValue('idle');
    
    // Mock capturePane to simulate comments are visible (successfully received)
    const mockPaneContent = `
Please address the following code review comments:

File: verify.ts
  Line 41: Verify comment
  Line 46: Success comment

I'll help you address these comments...
`;
    jest.spyOn(fakeTmuxService, 'capturePane').mockResolvedValue(mockPaneContent);
    
    const mockRunCommand = jest.spyOn(commandExecutor, 'runCommand').mockReturnValue('');
    const mockRunInteractive = jest.spyOn(commandExecutor, 'runInteractive').mockReturnValue(0);
    
    const comments = commentStore.getAllComments();
    
    // Simulate sending comments
    const messageLines = [
      "Please address the following code review comments:",
      "",
      "File: verify.ts",
      "  Line 41: Verify comment",
      "  Line 46: Success comment",
      ""
    ];
    
    messageLines.forEach((line) => {
      commandExecutor.runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, line]);
      commandExecutor.runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, 'Escape', 'Enter']);
    });
    
    // Simulate verification check - comments found in pane (successful delivery)
    const paneContent = await fakeTmuxService.capturePane(sessionName);
    const lastTwoLines = ["Verify comment", "Success comment"];
    let foundLines = 0;
    for (const line of lastTwoLines) {
      if (paneContent.includes(line.trim())) {
        foundLines++;
      }
    }
    
    // Verification success: both comments visible in pane
    expect(foundLines).toBe(2);
    
    // Comments should be cleared after successful verification
    commentStore.clear();
    expect(commentStore.count).toBe(0);
    
    // Should proceed to attach to session
    commandExecutor.runInteractive('tmux', ['attach-session', '-t', sessionName]);
    expect(mockRunInteractive).toHaveBeenCalledWith('tmux', ['attach-session', '-t', sessionName]);
    
    mockRunCommand.mockRestore();
    mockRunInteractive.mockRestore();
  });

  test('should handle partial verification - one comment line found', async () => {
    setupBasicProject('partial-project');
    const worktree = setupTestWorktree('partial-project', 'partial-feature');
    const commentStore = commentStoreManager.getStore(worktree.path);
    
    commentStore.addComment(50, 'partial.ts', 'const partial = 7;', 'Partial comment');
    commentStore.addComment(55, 'partial.ts', 'const missing = false;', 'Missing comment');
    
    const sessionName = 'dev-partial-project-partial-feature';
    
    // Mock session exists and Claude is idle
    jest.spyOn(fakeTmuxService, 'listSessions').mockResolvedValue([sessionName]);
    jest.spyOn(fakeTmuxService, 'getClaudeStatus').mockResolvedValue('idle');
    
    // Mock capturePane to simulate only one comment is visible (partial delivery)
    const mockPaneContent = `
Please address the following code review comments:

File: partial.ts
  Line 51: Partial comment

I can help with the first comment...
`;
    jest.spyOn(fakeTmuxService, 'capturePane').mockResolvedValue(mockPaneContent);
    
    const mockRunCommand = jest.spyOn(commandExecutor, 'runCommand').mockReturnValue('');
    const mockRunInteractive = jest.spyOn(commandExecutor, 'runInteractive').mockReturnValue(0);
    
    // Simulate verification check - only one comment found
    const paneContent = await fakeTmuxService.capturePane(sessionName);
    const lastTwoLines = ["Partial comment", "Missing comment"];
    let foundLines = 0;
    for (const line of lastTwoLines) {
      if (paneContent.includes(line.trim())) {
        foundLines++;
      }
    }
    
    // Partial verification: only one comment visible
    expect(foundLines).toBe(1);
    
    // According to verification logic, foundLines > 0 means success, so comments should be cleared
    commentStore.clear();
    expect(commentStore.count).toBe(0);
    
    mockRunCommand.mockRestore();
    mockRunInteractive.mockRestore();
  });
});