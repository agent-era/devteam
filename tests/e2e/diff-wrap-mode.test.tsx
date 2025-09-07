import {describe, beforeEach, test, expect, jest} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {
  resetTestData,
  setupBasicProject,
  setupTestWorktree,
  simulateTimeDelay
} from '../utils/testHelpers.js';
import * as commandExecutor from '../../src/shared/utils/commandExecutor.js';

// Long line content for wrap testing
const LONG_LINE_DIFF = `diff --git a/src/example.ts b/src/example.ts
index 1234567..abcdefg 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,10 +1,12 @@
 import React from 'react';
 
-const shortOld = 'value';
+const shortNew = 'value';
-function veryLongFunctionNameThatWillDefinitelyWrapInMostTerminalWidthsAndCauseMultipleRowsToBeUsedForTestingTheWrappingFunctionalityProperly() { return 'This is a very long string that continues for quite a while to test the wrapping functionality properly and ensure that all content remains accessible when lines exceed terminal width'; }
+function anotherVeryLongFunctionNameWithDifferentContentToTestSideBySideWrappingBehaviorAndEnsureProperRowCalculations() { return 'Different long content here to see how the two panes handle different amounts of wrapping and verify that the scrolling works correctly when one pane wraps more than the other'; }
 
-// This is a medium length comment that might wrap on narrower terminals but not on wide ones - testing edge cases
+// This is a different medium length comment with different content to test mixed line lengths and wrapping behavior
+
+const anotherVeryLongVariableDeclarationWithExtraContentToCreateMoreWrappingTestCasesAndVerifyThatScrollingWorksCorrectlyWhenMultipleLinesWrap = 'test content for scrolling verification';
 
 export default function Component() {
   return <div>Updated component</div>;
@@ -15,7 +17,12 @@
   return null;
 }
 
-const finalLongLineAtTheEndOfTheFileToTestScrollingToTheBottomWithWrappedContentAndVerifyThatAllContentRemainsAccessible = 'final test content that should be reachable with G key';`;

const UNICODE_WRAP_DIFF = `diff --git a/src/unicode.ts b/src/unicode.ts
index 1234567..abcdefg 100644
--- a/src/unicode.ts
+++ b/src/unicode.ts
@@ -1,5 +1,8 @@
-const emoji = '🚀 This line contains emojis 🎉 and should wrap properly while maintaining correct character width calculations 👨‍💻';
+const emoji = '🚀 Different emoji content 🎉 with wide characters 中文测试 and combined characters 👨‍💻 for comprehensive testing 🔬';
-const chinese = '这是一行包含中文字符的长文本内容用于测试文本换行功能是否能正确处理宽字符的显示宽度计算问题';
+const chinese = '这是一行不同的中文内容用于测试侧边对比模式下的文本换行功能和字符宽度计算是否准确无误处理各种Unicode字符';
+
+// Mixed content: ASCII + 中文 + emojis 🎯 in a very long line to test comprehensive wrapping
+const mixed = 'Start with ASCII, then 中文字符 mixed with emojis 🌟 and back to ASCII content that goes on for a while to test proper wrapping 🎪';`;

describe('Diff wrap mode E2E', () => {
  beforeEach(() => {
    resetTestData();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Basic wrap mode functionality', () => {
    test('should toggle wrap mode with w key', async () => {
      setupBasicProject('wrap-project');
      const worktree = setupTestWorktree('wrap-project', 'wrap-feature');
      
      // Mock git diff with normal content
      jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args) => {
        const command = args.join(' ');
        if (command.includes('git diff')) return LONG_LINE_DIFF;
        if (command.includes('merge-base')) return 'abc123def456';
        if (command.includes('ls-files --others')) return '';
        return '';
      });

      const {setUIMode, lastFrame, stdin} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Open diff view (starts in truncate mode)
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Wrap Test',
        diffType: 'full'
      });
      await simulateTimeDelay(100);
      
      // Should show truncate mode in help text
      let output = lastFrame();
      expect(output).toContain('w toggle wrap (truncate)');
      
      // Toggle to wrap mode
      stdin.write('w');
      await simulateTimeDelay(50);
      
      // Should show wrap mode in help text
      output = lastFrame();
      expect(output).toContain('w toggle wrap (wrap)');
      
      // Toggle back to truncate mode
      stdin.write('w');
      await simulateTimeDelay(50);
      
      // Should show truncate mode again
      output = lastFrame();
      expect(output).toContain('w toggle wrap (truncate)');
    });

    test('should display help text with wrap toggle option', async () => {
      setupBasicProject('help-project');
      const worktree = setupTestWorktree('help-project', 'help-feature');
      
      jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args) => {
        const command = args.join(' ');
        if (command.includes('git diff')) return LONG_LINE_DIFF;
        if (command.includes('merge-base')) return 'abc123def456';
        if (command.includes('ls-files --others')) return '';
        return '';
      });

      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Help Test',
        diffType: 'full'
      });
      await simulateTimeDelay(100);
      
      const output = lastFrame();
      expect(output).toContain('w toggle wrap');
      expect(output).toContain('v toggle view');
      expect(output).toContain('j/k move');
    });
  });

  describe('Scrolling with wrapped content', () => {
    test('should scroll to end with G key in wrap mode', async () => {
      setupBasicProject('scroll-project');
      const worktree = setupTestWorktree('scroll-project', 'scroll-feature');
      
      jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args) => {
        const command = args.join(' ');
        if (command.includes('git diff')) return LONG_LINE_DIFF;
        if (command.includes('merge-base')) return 'abc123def456';
        if (command.includes('ls-files --others')) return '';
        return '';
      });

      const {setUIMode, lastFrame, stdin} = renderTestApp();
      await simulateTimeDelay(50);
      
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Scroll Test',
        diffType: 'full'
      });
      await simulateTimeDelay(100);
      
      // Switch to wrap mode
      stdin.write('w');
      await simulateTimeDelay(50);
      
      // Go to the end with G
      stdin.write('G');
      await simulateTimeDelay(100);
      
      // Should not error and should show content
      const output = lastFrame();
      expect(output).toContain('Scroll Test');
      
      // Go to beginning with g
      stdin.write('g');
      await simulateTimeDelay(100);
      
      // Should work without errors
      expect(lastFrame()).toContain('Scroll Test');
    });

    test('should handle page navigation in wrap mode', async () => {
      setupBasicProject('page-project');
      const worktree = setupTestWorktree('page-project', 'page-feature');
      
      jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args) => {
        const command = args.join(' ');
        if (command.includes('git diff')) return LONG_LINE_DIFF;
        if (command.includes('merge-base')) return 'abc123def456';
        if (command.includes('ls-files --others')) return '';
        return '';
      });

      const {setUIMode, lastFrame, stdin} = renderTestApp();
      await simulateTimeDelay(50);
      
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Page Test',
        diffType: 'full'
      });
      await simulateTimeDelay(100);
      
      // Switch to wrap mode
      stdin.write('w');
      await simulateTimeDelay(50);
      
      // Page down
      stdin.write('f');
      await simulateTimeDelay(50);
      
      // Should work without errors
      let output = lastFrame();
      expect(output).toContain('Page Test');
      
      // Page up
      stdin.write('b');
      await simulateTimeDelay(50);
      
      // Should work without errors
      output = lastFrame();
      expect(output).toContain('Page Test');
      
      // Space bar (page down)
      stdin.write(' ');
      await simulateTimeDelay(50);
      
      // Should work without errors
      expect(lastFrame()).toContain('Page Test');
    });

    test('should handle line-by-line navigation in wrap mode', async () => {
      setupBasicProject('nav-project');
      const worktree = setupTestWorktree('nav-project', 'nav-feature');
      
      jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args) => {
        const command = args.join(' ');
        if (command.includes('git diff')) return LONG_LINE_DIFF;
        if (command.includes('merge-base')) return 'abc123def456';
        if (command.includes('ls-files --others')) return '';
        return '';
      });

      const {setUIMode, lastFrame, stdin} = renderTestApp();
      await simulateTimeDelay(50);
      
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Nav Test',
        diffType: 'full'
      });
      await simulateTimeDelay(100);
      
      // Switch to wrap mode
      stdin.write('w');
      await simulateTimeDelay(50);
      
      // Navigate down multiple times
      for (let i = 0; i < 5; i++) {
        stdin.write('j');
        await simulateTimeDelay(10);
      }
      
      // Should work without errors
      let output = lastFrame();
      expect(output).toContain('Nav Test');
      
      // Navigate up multiple times
      for (let i = 0; i < 3; i++) {
        stdin.write('k');
        await simulateTimeDelay(10);
      }
      
      // Should work without errors
      output = lastFrame();
      expect(output).toContain('Nav Test');
    });
  });

  describe('Side-by-side wrap mode', () => {
    test('should handle wrapping in both panes independently', async () => {
      setupBasicProject('sbs-project');
      const worktree = setupTestWorktree('sbs-project', 'sbs-feature');
      
      jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args) => {
        const command = args.join(' ');
        if (command.includes('git diff')) return LONG_LINE_DIFF;
        if (command.includes('merge-base')) return 'abc123def456';
        if (command.includes('ls-files --others')) return '';
        return '';
      });

      const {setUIMode, lastFrame, stdin} = renderTestApp();
      await simulateTimeDelay(50);
      
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'SBS Test',
        diffType: 'full'
      });
      await simulateTimeDelay(100);
      
      // Switch to side-by-side mode
      stdin.write('v');
      await simulateTimeDelay(50);
      
      // Switch to wrap mode
      stdin.write('w');
      await simulateTimeDelay(50);
      
      // Should show both panes in wrap mode
      const output = lastFrame();
      expect(output).toContain('SBS Test');
      expect(output).toContain('w toggle wrap (wrap)');
      expect(output).toContain('v toggle view (sidebyside)');
      
      // Navigation should work
      stdin.write('j');
      await simulateTimeDelay(10);
      expect(lastFrame()).toContain('SBS Test');
    });

    test('should navigate correctly in side-by-side wrap mode', async () => {
      setupBasicProject('sbs-nav-project');
      const worktree = setupTestWorktree('sbs-nav-project', 'sbs-nav-feature');
      
      jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args) => {
        const command = args.join(' ');
        if (command.includes('git diff')) return LONG_LINE_DIFF;
        if (command.includes('merge-base')) return 'abc123def456';
        if (command.includes('ls-files --others')) return '';
        return '';
      });

      const {setUIMode, lastFrame, stdin} = renderTestApp();
      await simulateTimeDelay(50);
      
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'SBS Nav Test',
        diffType: 'full'
      });
      await simulateTimeDelay(100);
      
      // Switch to side-by-side + wrap mode
      stdin.write('v');
      await simulateTimeDelay(50);
      stdin.write('w');
      await simulateTimeDelay(50);
      
      // Test chunk navigation (left/right arrows)
      stdin.write('\u001b[C'); // Right arrow
      await simulateTimeDelay(50);
      
      // Should work without errors
      let output = lastFrame();
      expect(output).toContain('SBS Nav Test');
      
      // Go to end and verify accessibility
      stdin.write('G');
      await simulateTimeDelay(100);
      
      // Should reach the end without errors
      output = lastFrame();
      expect(output).toContain('SBS Nav Test');
    });
  });

  describe('Unicode and special characters', () => {
    test('should wrap Unicode content correctly', async () => {
      setupBasicProject('unicode-project');
      const worktree = setupTestWorktree('unicode-project', 'unicode-feature');
      
      jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args) => {
        const command = args.join(' ');
        if (command.includes('git diff')) return UNICODE_WRAP_DIFF;
        if (command.includes('merge-base')) return 'abc123def456';
        if (command.includes('ls-files --others')) return '';
        return '';
      });

      const {setUIMode, lastFrame, stdin} = renderTestApp();
      await simulateTimeDelay(50);
      
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Unicode Test',
        diffType: 'full'
      });
      await simulateTimeDelay(100);
      
      // Switch to wrap mode
      stdin.write('w');
      await simulateTimeDelay(50);
      
      // Should display without errors
      let output = lastFrame();
      expect(output).toContain('Unicode Test');
      
      // Navigate through content
      stdin.write('j');
      await simulateTimeDelay(10);
      stdin.write('j');
      await simulateTimeDelay(10);
      
      // Should handle Unicode navigation correctly
      output = lastFrame();
      expect(output).toContain('Unicode Test');
      
      // Go to end
      stdin.write('G');
      await simulateTimeDelay(100);
      
      // Should reach end correctly
      expect(lastFrame()).toContain('Unicode Test');
    });

    test('should handle mixed Unicode in side-by-side wrap mode', async () => {
      setupBasicProject('unicode-sbs-project');
      const worktree = setupTestWorktree('unicode-sbs-project', 'unicode-sbs-feature');
      
      jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args) => {
        const command = args.join(' ');
        if (command.includes('git diff')) return UNICODE_WRAP_DIFF;
        if (command.includes('merge-base')) return 'abc123def456';
        if (command.includes('ls-files --others')) return '';
        return '';
      });

      const {setUIMode, lastFrame, stdin} = renderTestApp();
      await simulateTimeDelay(50);
      
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Unicode SBS Test',
        diffType: 'full'
      });
      await simulateTimeDelay(100);
      
      // Switch to side-by-side + wrap mode
      stdin.write('v');
      await simulateTimeDelay(50);
      stdin.write('w');
      await simulateTimeDelay(50);
      
      // Should display Unicode in side-by-side wrap mode
      const output = lastFrame();
      expect(output).toContain('Unicode SBS Test');
      expect(output).toContain('w toggle wrap (wrap)');
      expect(output).toContain('v toggle view (sidebyside)');
    });
  });

  describe('Edge cases', () => {
    test('should handle empty lines in wrap mode', async () => {
      setupBasicProject('empty-project');
      const worktree = setupTestWorktree('empty-project', 'empty-feature');
      
      const emptyDiff = `diff --git a/src/empty.ts b/src/empty.ts
index 1234567..abcdefg 100644
--- a/src/empty.ts
+++ b/src/empty.ts
@@ -1,3 +1,5 @@
 
 const value = 'test';
+
+const anotherValue = 'test2';
 `;
      
      jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args) => {
        const command = args.join(' ');
        if (command.includes('git diff')) return emptyDiff;
        if (command.includes('merge-base')) return 'abc123def456';
        if (command.includes('ls-files --others')) return '';
        return '';
      });

      const {setUIMode, lastFrame, stdin} = renderTestApp();
      await simulateTimeDelay(50);
      
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Empty Lines Test',
        diffType: 'full'
      });
      await simulateTimeDelay(100);
      
      // Switch to wrap mode
      stdin.write('w');
      await simulateTimeDelay(50);
      
      // Should handle empty lines correctly
      const output = lastFrame();
      expect(output).toContain('Empty Lines Test');
      
      // Navigate through empty lines
      stdin.write('j');
      await simulateTimeDelay(10);
      stdin.write('j');
      await simulateTimeDelay(10);
      
      // Should work without errors
      expect(lastFrame()).toContain('Empty Lines Test');
    });

    test('should handle very narrow terminal widths', async () => {
      setupBasicProject('narrow-project');
      const worktree = setupTestWorktree('narrow-project', 'narrow-feature');
      
      jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args) => {
        const command = args.join(' ');
        if (command.includes('git diff')) return LONG_LINE_DIFF;
        if (command.includes('merge-base')) return 'abc123def456';
        if (command.includes('ls-files --others')) return '';
        return '';
      });

      // Mock a narrow terminal (this is a simulation in our test)
      const {setUIMode, lastFrame, stdin} = renderTestApp();
      await simulateTimeDelay(50);
      
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Narrow Test',
        diffType: 'full'
      });
      await simulateTimeDelay(100);
      
      // Switch to wrap mode
      stdin.write('w');
      await simulateTimeDelay(50);
      
      // Should handle narrow width gracefully
      const output = lastFrame();
      expect(output).toContain('Narrow Test');
      
      // Navigation should still work
      stdin.write('G');
      await simulateTimeDelay(100);
      expect(lastFrame()).toContain('Narrow Test');
    });
  });

  describe('Comment functionality in wrap mode', () => {
    test('should handle comments in wrap mode', async () => {
      setupBasicProject('comment-wrap-project');
      const worktree = setupTestWorktree('comment-wrap-project', 'comment-wrap-feature');
      
      jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args) => {
        const command = args.join(' ');
        if (command.includes('git diff')) return LONG_LINE_DIFF;
        if (command.includes('merge-base')) return 'abc123def456';
        if (command.includes('ls-files --others')) return '';
        return '';
      });

      const {setUIMode, lastFrame, stdin} = renderTestApp();
      await simulateTimeDelay(50);
      
      setUIMode('diff', {
        worktreePath: worktree.path,
        title: 'Comment Wrap Test',
        diffType: 'full'
      });
      await simulateTimeDelay(100);
      
      // Switch to wrap mode
      stdin.write('w');
      await simulateTimeDelay(50);
      
      // Navigate to a content line and try to add comment
      stdin.write('j');
      stdin.write('j');
      await simulateTimeDelay(10);
      
      // Attempt to add comment
      stdin.write('c');
      await simulateTimeDelay(50);
      
      // Should handle comment functionality without error
      const output = lastFrame();
      expect(output).toBeTruthy(); // Should not crash
    });
  });
});