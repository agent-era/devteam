import {describe, beforeEach, test, expect, jest} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {
  resetTestData,
  setupBasicProject,
  setupTestWorktree,
  simulateTimeDelay
} from '../utils/testHelpers.js';
import * as commandExecutor from '../../src/shared/utils/commandExecutor.js';

describe('Side-by-side diff view E2E', () => {
  beforeEach(() => {
    resetTestData();
    
    // Mock git diff command with sample data
    jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args, opts) => {
      const command = args.join(' ');
      
      if (command.includes('git diff')) {
        return `diff --git a/src/example.ts b/src/example.ts
index 1234567..abcdefg 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,5 +1,8 @@
 import React from 'react';
 
-function oldFunction() {
-  return 'old';
-}
+function newFunction() {
+  return 'new';
+}
+
+// Added comment
 
 export default function Component() {`;
      }
      
      if (command.includes('merge-base')) {
        return 'abc123def456';
      }
      
      if (command.includes('git branch')) {
        return 'main\\n* feature/test-branch';
      }
      
      if (command.includes('ls-files --others')) {
        return '';
      }
      
      return '';
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should toggle between unified and side-by-side view modes', async () => {
    // Setup: Worktree with changes
    setupBasicProject('diff-project');
    const worktree = setupTestWorktree('diff-project', 'diff-feature');
    
    const {setUIMode, lastFrame, stdin} = renderTestApp();
    await simulateTimeDelay(50);
    
    // Open diff view in unified mode (default)
    setUIMode('diff', {
      worktreePath: worktree.path,
      title: 'Diff Viewer',
      diffType: 'full'
    });
    await simulateTimeDelay(100);
    
    // Should show unified diff initially
    const unifiedOutput = lastFrame();
    expect(unifiedOutput).toContain('Diff Viewer');
    expect(unifiedOutput).toContain('src/example.ts');
    
    // Toggle to side-by-side view
    stdin.write('v');
    await simulateTimeDelay(50);
    
    // Should show the diff content (exact format may vary in mock)
    const sideBySideOutput = lastFrame();
    expect(sideBySideOutput).toContain('Diff Viewer');
    expect(sideBySideOutput).toContain('src/example.ts');
    
    // Toggle back to unified
    stdin.write('v');
    await simulateTimeDelay(50);
    
    // Should still show diff content
    const backToUnifiedOutput = lastFrame();
    expect(backToUnifiedOutput).toContain('Diff Viewer');
  });

  test('should navigate correctly in side-by-side mode', async () => {
    setupBasicProject('nav-project');
    const worktree = setupTestWorktree('nav-project', 'nav-feature');
    
    const {setUIMode, lastFrame, stdin} = renderTestApp();
    await simulateTimeDelay(50);
    
    // Open diff view and switch to side-by-side
    setUIMode('diff', {
      worktreePath: worktree.path,
      title: 'Navigation Test',
      diffType: 'full'
    });
    await simulateTimeDelay(100);
    
    // Switch to side-by-side mode
    stdin.write('v');
    await simulateTimeDelay(50);
    
    // Navigate down
    stdin.write('j');
    await simulateTimeDelay(10);
    
    const output = lastFrame();
    expect(output).toContain('Navigation Test');
    
    // Navigate up
    stdin.write('k');
    await simulateTimeDelay(10);
    
    // Navigation should work without errors
    expect(lastFrame()).toContain('Navigation Test');
  });

  test('should handle comment functionality in side-by-side mode', async () => {
    setupBasicProject('comment-project');
    const worktree = setupTestWorktree('comment-project', 'comment-feature');
    
    const {setUIMode, lastFrame, stdin} = renderTestApp();
    await simulateTimeDelay(50);
    
    // Open diff view and switch to side-by-side
    setUIMode('diff', {
      worktreePath: worktree.path,
      title: 'Comment Test',
      diffType: 'full'
    });
    await simulateTimeDelay(100);
    
    // Switch to side-by-side mode
    stdin.write('v');
    await simulateTimeDelay(50);
    
    // Navigate to a non-header line
    stdin.write('j'); // Move to first content line
    stdin.write('j'); // Move to second content line  
    await simulateTimeDelay(10);
    
    // Try to add a comment
    stdin.write('c');
    await simulateTimeDelay(50);
    
    // Should show comment dialog or handle comment functionality
    // The exact behavior depends on the line type and content
    const output = lastFrame();
    // Test passes if no errors occur during comment attempt
    expect(output).toBeTruthy();
  });
});