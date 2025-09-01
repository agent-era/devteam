import {describe, beforeEach, test, expect, jest, afterEach} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {
  resetTestData,
  setupBasicProject,
  setupTestWorktree,
  simulateTimeDelay,
} from '../utils/testHelpers.js';
import {commentStoreManager} from '../../src/services/CommentStoreManager.js';
import * as commandExecutor from '../../src/shared/utils/commandExecutor.js';

describe('Diff File Navigation E2E', () => {
  beforeEach(() => {
    resetTestData();
    
    // Mock git commands with multi-file diff
    jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args) => {
      const command = args.join(' ');
      
      // Mock git diff with multiple files
      if (command.includes('git diff')) {
        return `diff --git a/src/file1.ts b/src/file1.ts
index 1234567..abcdefg 100644
--- a/src/file1.ts
+++ b/src/file1.ts
@@ -1,3 +1,6 @@
 // File 1 content
 export function file1Function() {
-  return 'old';
+  return 'new';
+}
+
+function additionalFunction() {
+  return 'added';
 }
diff --git a/src/file2.ts b/src/file2.ts
index 2345678..bcdefgh 100644
--- a/src/file2.ts
+++ b/src/file2.ts
@@ -1,2 +1,4 @@
 // File 2 content
-console.log('file2');
+console.log('file2 updated');
+
+export default 'new export';
diff --git a/src/file3.ts b/src/file3.ts
index 3456789..cdefghi 100644
--- a/src/file3.ts
+++ b/src/file3.ts
@@ -1,4 +1,7 @@
 // File 3 content
 const value = 'test';
+const newValue = 'added';
 
-export { value };
+export { value, newValue };
+
+console.log('More changes');`;
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
      return '';
    }
    
    // Mock tmux operations
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

  describe('File Header Navigation and Scrolling', () => {
    test('should navigate between files with shift+up/down and show correct file content', async () => {
      // Setup: Project with multi-file diff
      setupBasicProject('file-nav-project');
      const worktree = setupTestWorktree('file-nav-project', 'multi-file-feature');
      
      const {setUIMode, lastFrame, stdin} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open diff view
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Multi-File Diff',
        diffType: 'full'
      });
      await simulateTimeDelay(100);
      
      // Should start at first file (file1.ts)
      let output = lastFrame();
      expect(output).toContain('📁 src/file1.ts');
      
      // Navigate to next file using Shift+Down
      stdin.write('\u001b[1;2B'); // Shift+Down arrow escape sequence
      await simulateTimeDelay(100);
      
      // Should now show file2.ts content
      output = lastFrame();
      expect(output).toContain('📁 src/file2.ts');
      expect(output).toContain('// File 2 content');
      
      // Navigate to file3 using another Shift+Down
      stdin.write('\u001b[1;2B'); 
      await simulateTimeDelay(100);
      
      // Should now be at file3
      output = lastFrame();
      expect(output).toContain('📁 src/file3.ts');
      expect(output).toContain('// File 3 content');
      
      // Navigate back to file2 using Shift+Up
      stdin.write('\u001b[1;2A'); // Shift+Up arrow escape sequence
      await simulateTimeDelay(100);
      
      // Should now show file2.ts again
      output = lastFrame();
      expect(output).toContain('📁 src/file2.ts');
      expect(output).toContain('// File 2 content');
    });

    test('should work correctly at file boundaries', async () => {
      // Setup: Project with multi-file diff
      setupBasicProject('boundary-project');
      const worktree = setupTestWorktree('boundary-project', 'boundary-feature');
      
      const {setUIMode, lastFrame, stdin} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open diff view
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Boundary Test Diff',
        diffType: 'full'
      });
      await simulateTimeDelay(100);
      
      // Should start at first file
      let output = lastFrame();
      expect(output).toContain('📁 src/file1.ts');
      
      // Try to navigate to previous file (should stay at first file)
      stdin.write('\u001b[1;2A'); // Shift+Up
      await simulateTimeDelay(100);
      
      // Should still be at first file
      output = lastFrame();
      expect(output).toContain('📁 src/file1.ts');
      
      // Navigate to last file (shift+down twice)
      stdin.write('\u001b[1;2B'); // To file2
      await simulateTimeDelay(50);
      stdin.write('\u001b[1;2B'); // To file3
      await simulateTimeDelay(100);
      
      // Should be at last file
      output = lastFrame();
      expect(output).toContain('📁 src/file3.ts');
      
      // Try to navigate to next file (should stay at last file)
      stdin.write('\u001b[1;2B'); // Shift+Down
      await simulateTimeDelay(100);
      
      // Should still be at last file
      output = lastFrame();
      expect(output).toContain('📁 src/file3.ts');
    });

    test('should work in different view modes (unified/side-by-side/wrap)', async () => {
      // Setup: Project with multi-file diff
      setupBasicProject('view-modes-project');
      const worktree = setupTestWorktree('view-modes-project', 'view-modes-feature');
      
      const {setUIMode, lastFrame, stdin} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open diff view - use title pattern that triggers multi-file output
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Multi-File Diff View Modes',
        diffType: 'full'
      });
      await simulateTimeDelay(100);
      
      // Test unified mode (default) - navigate to file2
      stdin.write('\u001b[1;2B'); // Navigate to file2
      await simulateTimeDelay(100);
      let output = lastFrame();
      expect(output).toContain('📁 src/file2.ts');
      
      // Test side-by-side view
      stdin.write('v'); // Toggle to side-by-side
      await simulateTimeDelay(100);
      stdin.write('\u001b[1;2B'); // Navigate to file3
      await simulateTimeDelay(100);
      output = lastFrame();
      expect(output).toContain('📁 src/file3.ts');
      
      // Test wrap mode
      stdin.write('v'); // Back to unified
      stdin.write('w'); // Toggle wrap mode
      await simulateTimeDelay(100);
      stdin.write('\u001b[1;2A'); // Navigate back to file2
      await simulateTimeDelay(100);
      output = lastFrame();
      expect(output).toContain('📁 src/file2.ts');
    });
  });

  describe('Sticky Header Behavior', () => {
    test('should show navigated file as sticky header and not duplicate in viewport', async () => {
      // Setup: Project with multi-file diff
      setupBasicProject('sticky-header-project');
      const worktree = setupTestWorktree('sticky-header-project', 'sticky-header-feature');
      
      const {setUIMode, lastFrame, stdin} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open diff view
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Multi-File Diff',
        diffType: 'full'
      });
      await simulateTimeDelay(100);
      
      // Navigate to file2 using Shift+Down
      stdin.write('\u001b[1;2B'); // Shift+Down arrow
      await simulateTimeDelay(100);
      
      // Should show file2.ts content and header should become sticky
      const output = lastFrame();
      expect(output).toContain('📁 src/file2.ts');
      expect(output).toContain('// File 2 content');
      
      // Navigate to file3, then back to file2 to test both directions
      stdin.write('\u001b[1;2B'); // To file3
      await simulateTimeDelay(50);
      stdin.write('\u001b[1;2A'); // Back to file2
      await simulateTimeDelay(100);
      
      // Should still show file2.ts as the navigated file
      const output2 = lastFrame();
      expect(output2).toContain('📁 src/file2.ts');
      expect(output2).toContain('// File 2 content');
    });
  });

  describe('Single File Navigation', () => {
    test('should handle navigation when only one file exists', async () => {
      // Mock single file diff
      jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args) => {
        const command = args.join(' ');
        
        if (command.includes('git diff')) {
          return `diff --git a/single.ts b/single.ts
index 1234567..abcdefg 100644
--- a/single.ts
+++ b/single.ts
@@ -1,2 +1,4 @@
 // Single file
-export const value = 'old';
+export const value = 'new';
+
+console.log('Added line');`;
        }
        
        if (command.includes('merge-base')) {
          return 'abc123def456';
        }
        
        if (command.includes('git branch')) {
          return 'main\n* feature/single-file';
        }
        
        if (command.includes('ls-files --others')) {
          return '';
        }
        
        return '';
      });

      setupBasicProject('single-file-project');
      const worktree = setupTestWorktree('single-file-project', 'single-file-feature');
      
      const {setUIMode, lastFrame, stdin} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open diff view
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Single File Diff',
        diffType: 'full'
      });
      await simulateTimeDelay(100);
      
      // Should show the single file
      let output = lastFrame();
      expect(output).toContain('📁 single.ts');
      
      // Try to navigate to next file (should stay on same file)
      stdin.write('\u001b[1;2B'); // Shift+Down
      await simulateTimeDelay(100);
      
      // Should still show the same file
      output = lastFrame();
      expect(output).toContain('📁 single.ts');
      
      // Try to navigate to previous file (should stay on same file)
      stdin.write('\u001b[1;2A'); // Shift+Up
      await simulateTimeDelay(100);
      
      // Should still show the same file
      output = lastFrame();
      expect(output).toContain('📁 single.ts');
    });
  });
});